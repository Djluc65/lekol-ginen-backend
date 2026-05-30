import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';

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

function toPublicJSON(user) {
  const { passwordHash, ...publicUser } = user;
  return publicUser;
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
}
