import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import crypto from 'node:crypto';

const registerBody = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_.-]+$/, 'invalid characters'),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().max(80).optional(),
});

const loginBody = z.object({
  identifier: z.string().min(3), // username or email
  password: z.string().min(1),
});

const changePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

const forgotPasswordBody = z.object({
  email: z.string().email(),
});

const resetPasswordBody = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8).max(200),
});

function toPublicJSON(user) {
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

function isAllowedOrigin(origin) {
  if (!origin) return false;
  return env.corsOrigin.includes(origin);
}

function base64UrlEncode(input) {
  return Buffer.from(String(input || ''), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input) {
  const s = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, 'base64').toString('utf8');
}

function parseState(state) {
  const raw = String(state || '');
  const dot = raw.indexOf('.');
  if (dot === -1) return { nonce: raw, origin: '' };
  const nonce = raw.slice(0, dot);
  const originEnc = raw.slice(dot + 1);
  let origin = '';
  try {
    origin = base64UrlDecode(originEnc);
  } catch {
    origin = '';
  }
  return { nonce, origin };
}

function oauthPopupHtml({ origin, payload }) {
  const safeOrigin = String(origin || '').replace(/"/g, '\\"');
  const json = JSON.stringify(payload || {});
  const safeJson = json.replace(/</g, '\\u003c');
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Connexion…</title>
  </head>
  <body>
    <script>
      (function () {
        try {
          const payload = ${safeJson};
          if (window.opener && typeof window.opener.postMessage === "function") {
            window.opener.postMessage(payload, "${safeOrigin}");
          }
        } catch (e) {}
        try { window.close(); } catch (e) {}
      })();
    </script>
  </body>
</html>`;
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input || ''), 'utf8').digest('hex');
}

async function createSessionForUser({ user, reply }) {
  const accessToken = await reply.jwtSign({ sub: user.id, username: user.username, role: user.role });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  const refreshTokenDoc = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: 'session',
      expiresAt,
    }
  });

  reply.setCookie('refreshToken', refreshTokenDoc.id, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60
  });

  return accessToken;
}

async function ensureUniqueUsername(base) {
  const cleaned = String(base || '')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '')
    .replace(/(^[_.-]+|[_.-]+$)/g, '');
  let candidate = cleaned.length >= 3 ? cleaned : `user${cleaned}`.slice(0, 20);
  if (candidate.length < 3) candidate = `user${Math.floor(Math.random() * 10000)}`;
  candidate = candidate.slice(0, 50);

  for (let i = 0; i < 12; i += 1) {
    const exists = await prisma.user.findUnique({ where: { username: candidate } });
    if (!exists) return candidate;
    candidate = `${cleaned.slice(0, 40) || 'user'}${Math.floor(1000 + Math.random() * 9000)}`.slice(0, 50);
  }
  return `user${crypto.randomBytes(8).toString('hex')}`.slice(0, 50);
}

async function findOrCreateUserFromOAuth({ provider, providerAccountId, email, displayName, avatarUrl, isVerified }) {
  const existingAccount = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    include: { user: true },
  });
  if (existingAccount?.user) return existingAccount.user;

  const normalizedEmail = email ? String(email).toLowerCase() : null;
  let user = null;
  if (normalizedEmail) {
    user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  }

  if (!user) {
    const usernameBase =
      (displayName && String(displayName).trim()) ||
      (normalizedEmail ? normalizedEmail.split('@')[0] : '') ||
      `${provider}${providerAccountId}`.slice(0, 20);
    const username = await ensureUniqueUsername(usernameBase);
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    const safeDisplayName =
      (displayName && String(displayName).trim()) ||
      (normalizedEmail ? normalizedEmail.split('@')[0] : '') ||
      username;
    user = await prisma.user.create({
      data: {
        username,
        email: normalizedEmail || `${username}@invalid.local`,
        passwordHash,
        displayName: safeDisplayName,
        avatarUrl: avatarUrl || null,
        isVerified: Boolean(isVerified),
      }
    });
  } else {
    const update = {};
    const currentAvatar = String(user.avatarUrl || '');
    const canRefreshAvatar =
      !currentAvatar ||
      (provider === 'google' && currentAvatar.includes('googleusercontent.com')) ||
      (provider === 'facebook' && (currentAvatar.includes('fbcdn') || currentAvatar.includes('facebook')));
    if (avatarUrl && canRefreshAvatar) update.avatarUrl = avatarUrl;

    const currentName = user.displayName ? String(user.displayName) : '';
    const safeDisplayName = displayName ? String(displayName).trim() : '';
    const canRefreshName = !currentName || currentName === user.username;
    if (safeDisplayName && canRefreshName) update.displayName = safeDisplayName;

    if (isVerified && !user.isVerified) update.isVerified = true;
    if (Object.keys(update).length) {
      user = await prisma.user.update({ where: { id: user.id }, data: update });
    }
  }

  await prisma.oAuthAccount.create({
    data: {
      provider,
      providerAccountId,
      userId: user.id,
      email: normalizedEmail,
    }
  });

  return user;
}

export default async function authRoutes(fastify) {
  // --- REGISTER ---
  fastify.post('/register', async (req, reply) => {
    const parsed = registerBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });

    const { username, email, password, displayName } = parsed.data;
    const exists = await prisma.user.findFirst({
      where: { OR: [{ username }, { email: email.toLowerCase() }] }
    });
    if (exists) return reply.code(409).send({ error: 'user_exists' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        username,
        email: email.toLowerCase(),
        passwordHash,
        displayName: displayName || username,
      }
    });

    const accessToken = await reply.jwtSign({ sub: user.id, username: user.username, role: user.role });
    
    // Create refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days
    const refreshTokenDoc = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: await bcrypt.hash(accessToken, 10), // Placeholder hash or use a separate UUID
        expiresAt,
      }
    });

    reply.setCookie('refreshToken', refreshTokenDoc.id, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    });

    return { user: toPublicJSON(user), accessToken };
  });

  // --- LOGIN ---
  fastify.post('/login', async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

    const { identifier, password } = parsed.data;
    const isEmail = identifier.includes('@');
    const user = await prisma.user.findUnique({
      where: isEmail ? { email: identifier.toLowerCase() } : { username: identifier }
    });
    if (!user) return reply.code(401).send({ error: 'invalid_credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return reply.code(401).send({ error: 'invalid_credentials' });

    const accessToken = await reply.jwtSign({ sub: user.id, username: user.username, role: user.role });
    
    // Create refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    const refreshTokenDoc = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: 'session', // simpler for now
        expiresAt,
      }
    });

    reply.setCookie('refreshToken', refreshTokenDoc.id, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60
    });

    return { user: toPublicJSON(user), accessToken };
  });

  // --- REFRESH ---
  fastify.post('/refresh', async (req, reply) => {
    const refreshTokenId = req.cookies.refreshToken;
    if (!refreshTokenId) return reply.code(401).send({ error: 'missing_refresh_token' });

    const tokenDoc = await prisma.refreshToken.findUnique({
      where: { id: refreshTokenId },
      include: { user: true }
    });

    if (!tokenDoc || tokenDoc.expiresAt < new Date()) {
      if (tokenDoc) await prisma.refreshToken.delete({ where: { id: refreshTokenId } });
      return reply.code(401).send({ error: 'invalid_refresh_token' });
    }

    const accessToken = await reply.jwtSign({ 
      sub: tokenDoc.user.id, 
      username: tokenDoc.user.username, 
      role: tokenDoc.user.role 
    });

    return { accessToken };
  });

  // --- LOGOUT ---
  fastify.post('/logout', async (req, reply) => {
    const refreshTokenId = req.cookies.refreshToken;
    if (refreshTokenId) {
      await prisma.refreshToken.deleteMany({ where: { id: refreshTokenId } });
    }
    reply.clearCookie('refreshToken', { path: '/' });
    return { ok: true };
  });

  fastify.post('/change-password', async (req, reply) => {
    const parsed = changePasswordBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const { currentPassword, newPassword } = parsed.data;
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return reply.code(400).send({ error: 'invalid_current_password' });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    const accessToken = await createSessionForUser({ user: updated, reply });
    return { ok: true, accessToken, user: toPublicJSON(updated) };
  });

  fastify.post('/forgot-password', async (req, reply) => {
    const parsed = forgotPasswordBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const email = parsed.data.email.toLowerCase();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return { ok: true };

    const token = crypto.randomBytes(24).toString('hex');
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      }
    });

    if (env.nodeEnv !== 'production') {
      return { ok: true, resetToken: token };
    }
    return { ok: true };
  });

  fastify.post('/reset-password', async (req, reply) => {
    const parsed = resetPasswordBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const { token, newPassword } = parsed.data;

    const tokenHash = sha256Hex(token);
    const doc = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
    if (!doc || !doc.user) return reply.code(400).send({ error: 'invalid_or_expired_token' });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: doc.userId }, data: { passwordHash, isVerified: true } }),
      prisma.passwordResetToken.update({ where: { id: doc.id }, data: { usedAt: new Date() } }),
      prisma.refreshToken.deleteMany({ where: { userId: doc.userId } }),
    ]);

    reply.clearCookie('refreshToken', { path: '/' });
    const updated = await prisma.user.findUnique({ where: { id: doc.userId } });
    const accessToken = await createSessionForUser({ user: updated, reply });
    return { ok: true, accessToken, user: toPublicJSON(updated) };
  });

  // --- ME ---
  fastify.get('/me', async (req, reply) => {
    try {
      await req.jwtVerify();
      const user = await prisma.user.findUnique({
        where: { id: req.user.sub }
      });
      if (!user) return reply.code(404).send({ error: 'user_not_found' });
      return { user: toPublicJSON(user) };
    } catch (err) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });

  fastify.get('/oauth/google/start', async (req, reply) => {
    if (!env.googleClientId || !env.googleClientSecret) {
      return reply.code(400).send({ error: 'google_oauth_not_configured' });
    }
    const origin = String(req.query?.origin || '');
    if (!isAllowedOrigin(origin)) return reply.code(400).send({ error: 'invalid_origin' });

    const nonce = crypto.randomBytes(16).toString('hex');
    reply.setCookie('oauth_state_google', nonce, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60,
    });

    const redirectUri = `${origin}/api/auth/oauth/google/callback`;
    const state = `${nonce}.${base64UrlEncode(origin)}`;
    const params = new URLSearchParams({
      client_id: env.googleClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  fastify.get('/oauth/google/callback', async (req, reply) => {
    const { code, state, error } = req.query || {};
    const { nonce, origin } = parseState(state);
    if (!isAllowedOrigin(origin)) return reply.code(400).send({ error: 'invalid_origin' });
    const expected = req.cookies.oauth_state_google;
    reply.clearCookie('oauth_state_google', { path: '/' });
    if (!expected || expected !== nonce) return reply.code(400).send({ error: 'invalid_state' });
    if (error) return reply.code(400).send({ error: 'oauth_error', provider: 'google', details: String(error) });
    if (!code) return reply.code(400).send({ error: 'missing_code' });

    try {
      const redirectUri = `${origin}/api/auth/oauth/google/callback`;
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(code),
          client_id: env.googleClientId,
          client_secret: env.googleClientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) {
        return reply
          .type('text/html')
          .send(oauthPopupHtml({ origin, payload: { type: 'oauth_error', provider: 'google', error: tokenJson } }));
      }

      const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { authorization: `Bearer ${tokenJson.access_token}` },
      });
      const profile = await userRes.json();
      if (!userRes.ok) {
        return reply
          .type('text/html')
          .send(oauthPopupHtml({ origin, payload: { type: 'oauth_error', provider: 'google', error: profile } }));
      }

      const user = await findOrCreateUserFromOAuth({
        provider: 'google',
        providerAccountId: String(profile.sub || ''),
        email: profile.email || null,
        displayName: profile.name || null,
        avatarUrl: profile.picture || null,
        isVerified: Boolean(profile.email_verified),
      });

      const accessToken = await createSessionForUser({ user, reply });
      return reply
        .type('text/html')
        .send(oauthPopupHtml({ origin, payload: { type: 'oauth_success', provider: 'google', accessToken, user: toPublicJSON(user) } }));
    } catch (err) {
      try {
        fastify.log.error({ err }, 'OAuth google callback failed');
      } catch {}
      return reply
        .type('text/html')
        .send(oauthPopupHtml({
          origin,
          payload: {
            type: 'oauth_error',
            provider: 'google',
            error: env.nodeEnv !== 'production'
              ? { message: 'internal_error', details: String(err?.message || err) }
              : { message: 'internal_error' },
          }
        }));
    }
  });

  fastify.get('/oauth/facebook/start', async (req, reply) => {
    if (!env.facebookClientId || !env.facebookClientSecret) {
      return reply.code(400).send({ error: 'facebook_oauth_not_configured' });
    }
    const origin = String(req.query?.origin || '');
    if (!isAllowedOrigin(origin)) return reply.code(400).send({ error: 'invalid_origin' });

    const nonce = crypto.randomBytes(16).toString('hex');
    reply.setCookie('oauth_state_facebook', nonce, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60,
    });

    const redirectUri = `${origin}/api/auth/oauth/facebook/callback`;
    const state = `${nonce}.${base64UrlEncode(origin)}`;
    const params = new URLSearchParams({
      client_id: env.facebookClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'email,public_profile',
      state,
    });
    return reply.redirect(`https://www.facebook.com/v23.0/dialog/oauth?${params.toString()}`);
  });

  fastify.get('/oauth/facebook/callback', async (req, reply) => {
    const { code, state, error } = req.query || {};
    const { nonce, origin } = parseState(state);
    if (!isAllowedOrigin(origin)) return reply.code(400).send({ error: 'invalid_origin' });
    const expected = req.cookies.oauth_state_facebook;
    reply.clearCookie('oauth_state_facebook', { path: '/' });
    if (!expected || expected !== nonce) return reply.code(400).send({ error: 'invalid_state' });
    if (error) return reply.code(400).send({ error: 'oauth_error', provider: 'facebook', details: String(error) });
    if (!code) return reply.code(400).send({ error: 'missing_code' });

    try {
      const redirectUri = `${origin}/api/auth/oauth/facebook/callback`;
      const tokenParams = new URLSearchParams({
        client_id: env.facebookClientId,
        client_secret: env.facebookClientSecret,
        redirect_uri: redirectUri,
        code: String(code),
      });
      const tokenRes = await fetch(`https://graph.facebook.com/v23.0/oauth/access_token?${tokenParams.toString()}`);
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) {
        return reply
          .type('text/html')
          .send(oauthPopupHtml({ origin, payload: { type: 'oauth_error', provider: 'facebook', error: tokenJson } }));
      }

      const profileRes = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(tokenJson.access_token)}`);
      const profile = await profileRes.json();
      if (!profileRes.ok) {
        return reply
          .type('text/html')
          .send(oauthPopupHtml({ origin, payload: { type: 'oauth_error', provider: 'facebook', error: profile } }));
      }

      const user = await findOrCreateUserFromOAuth({
        provider: 'facebook',
        providerAccountId: String(profile.id || ''),
        email: profile.email || null,
        displayName: profile.name || null,
        avatarUrl: profile?.picture?.data?.url || null,
        isVerified: Boolean(profile.email),
      });

      const accessToken = await createSessionForUser({ user, reply });
      return reply
        .type('text/html')
        .send(oauthPopupHtml({ origin, payload: { type: 'oauth_success', provider: 'facebook', accessToken, user: toPublicJSON(user) } }));
    } catch (err) {
      try {
        fastify.log.error({ err }, 'OAuth facebook callback failed');
      } catch {}
      return reply
        .type('text/html')
        .send(oauthPopupHtml({
          origin,
          payload: {
            type: 'oauth_error',
            provider: 'facebook',
            error: env.nodeEnv !== 'production'
              ? { message: 'internal_error', details: String(err?.message || err) }
              : { message: 'internal_error' },
          }
        }));
    }
  });
}
