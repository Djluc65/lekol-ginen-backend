import { prisma } from '../db.js';
import { z } from 'zod';
import crypto from 'node:crypto';

const createSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, 'invalid_slug'),
  description: z.string().max(2000).optional(),
  type: z.enum(['public', 'closed', 'secret']).optional(),
});

const inviteSchema = z.object({
  role: z.enum(['member', 'moderator']).optional(),
  maxUses: z.number().int().min(1).max(500).optional(),
  expiresInDays: z.number().int().min(1).max(60).optional(),
});

export default async function communitiesRoutes(fastify) {
  fastify.get('/invites/:token', async (req, reply) => {
    const invite = await prisma.communityInvite.findUnique({
      where: { token: req.params.token },
      include: {
        community: { select: { id: true, name: true, slug: true, type: true } }
      }
    });
    if (!invite) return reply.code(404).send({ error: 'not_found' });
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return reply.code(410).send({ error: 'expired' });
    if (invite.maxUses !== null && invite.maxUses !== undefined && invite.usesCount >= invite.maxUses) return reply.code(410).send({ error: 'expired' });
    return {
      token: invite.token,
      role: invite.role,
      expiresAt: invite.expiresAt,
      maxUses: invite.maxUses,
      usesCount: invite.usesCount,
      community: invite.community,
    };
  });

  fastify.post('/invites/:token/accept', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const invite = await prisma.communityInvite.findUnique({
      where: { token: req.params.token },
      include: { community: { select: { id: true } } }
    });
    if (!invite) return reply.code(404).send({ error: 'not_found' });
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return reply.code(410).send({ error: 'expired' });
    if (invite.maxUses !== null && invite.maxUses !== undefined && invite.usesCount >= invite.maxUses) return reply.code(410).send({ error: 'expired' });

    const existing = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: invite.communityId, userId: req.user.sub } }
    });
    if (existing) {
      if (existing.role === 'banned') return reply.code(403).send({ error: 'forbidden' });
      return { ok: true, communityId: invite.communityId };
    }

    await prisma.$transaction([
      prisma.communityMember.create({
        data: {
          communityId: invite.communityId,
          userId: req.user.sub,
          role: invite.role || 'member',
        }
      }),
      prisma.community.update({
        where: { id: invite.communityId },
        data: { membersCount: { increment: 1 } }
      }),
      prisma.communityInvite.update({
        where: { id: invite.id },
        data: { usesCount: { increment: 1 } }
      })
    ]);

    return { ok: true, communityId: invite.communityId };
  });

  fastify.get('/', async (req) => {
    let viewerId = null;
    try {
      if (req.headers?.authorization) {
        await req.jwtVerify();
        viewerId = req.user?.sub || null;
      }
    } catch (_err) {
      viewerId = null;
    }

    const { limit = 20, offset = 0 } = req.query || {};
    const [items, count] = await Promise.all([
      prisma.community.findMany({
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(limit), 100),
        skip: Number(offset),
        include: {
          _count: { select: { members: true, posts: true } }
        }
      }),
      prisma.community.count()
    ]);

    if (!viewerId) return { count, items: items.map((c) => ({ ...c, joinedByMe: false })) };

    const joined = await prisma.communityMember.findMany({
      where: { userId: viewerId, communityId: { in: items.map((c) => c.id) } },
      select: { communityId: true, role: true }
    });
    const joinedSet = new Map(joined.map((j) => [j.communityId, j.role]));

    return {
      count,
      items: items.map((c) => ({
        ...c,
        joinedByMe: joinedSet.has(c.id),
        myRole: joinedSet.get(c.id) || null,
      }))
    };
  });

  fastify.post('/', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });

    const exists = await prisma.community.findUnique({ where: { slug: parsed.data.slug } });
    if (exists) return reply.code(409).send({ error: 'slug_taken' });

    const community = await prisma.community.create({
      data: {
        name: parsed.data.name,
        slug: parsed.data.slug,
        description: parsed.data.description || null,
        type: parsed.data.type || 'public',
        membersCount: 1,
      }
    });

    await prisma.communityMember.create({
      data: {
        communityId: community.id,
        userId: req.user.sub,
        role: 'creator',
      }
    });

    return reply.code(201).send(community);
  });

  fastify.post('/:id/invites', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const community = await prisma.community.findUnique({ where: { id: req.params.id } });
    if (!community) return reply.code(404).send({ error: 'not_found' });

    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: req.params.id, userId: req.user.sub } }
    });
    if (!membership || membership.role === 'banned') return reply.code(403).send({ error: 'forbidden' });
    if (!['creator', 'admin', 'moderator'].includes(membership.role)) return reply.code(403).send({ error: 'forbidden' });

    const parsed = inviteSchema.safeParse(req.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });

    const expiresInDays = parsed.data.expiresInDays ?? 14;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    const role = parsed.data.role || 'member';
    const maxUses = parsed.data.maxUses ?? 50;

    let token = null;
    for (let i = 0; i < 3; i += 1) {
      const candidate = crypto.randomBytes(16).toString('hex');
      const exists = await prisma.communityInvite.findUnique({ where: { token: candidate } });
      if (!exists) {
        token = candidate;
        break;
      }
    }
    if (!token) return reply.code(500).send({ error: 'token_generation_failed' });

    const invite = await prisma.communityInvite.create({
      data: {
        communityId: req.params.id,
        createdById: req.user.sub,
        token,
        role,
        maxUses,
        expiresAt,
      }
    });

    return reply.code(201).send({
      token: invite.token,
      expiresAt: invite.expiresAt,
      maxUses: invite.maxUses,
      role: invite.role,
      usesCount: invite.usesCount,
      communityId: invite.communityId,
    });
  });

  fastify.post('/:id/join', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const community = await prisma.community.findUnique({ where: { id: req.params.id } });
    if (!community) return reply.code(404).send({ error: 'not_found' });

    const existing = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: req.params.id, userId: req.user.sub } }
    });

    if (existing) {
      if (existing.role === 'banned') return reply.code(403).send({ error: 'forbidden' });
      return { ok: true };
    }

    await prisma.$transaction([
      prisma.communityMember.create({
        data: {
          communityId: req.params.id,
          userId: req.user.sub,
          role: 'member',
        }
      }),
      prisma.community.update({
        where: { id: req.params.id },
        data: { membersCount: { increment: 1 } }
      })
    ]);

    return { ok: true };
  });

  fastify.delete('/:id/join', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const community = await prisma.community.findUnique({ where: { id: req.params.id } });
    if (!community) return reply.code(404).send({ error: 'not_found' });

    const existing = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: req.params.id, userId: req.user.sub } }
    });
    if (!existing) return { ok: true };
    if (existing.role === 'creator') return reply.code(400).send({ error: 'cannot_leave' });

    await prisma.$transaction([
      prisma.communityMember.delete({
        where: { communityId_userId: { communityId: req.params.id, userId: req.user.sub } }
      }),
      prisma.community.update({
        where: { id: req.params.id },
        data: { membersCount: { decrement: 1 } }
      })
    ]);

    return { ok: true };
  });

  fastify.get('/:id/members', async (req, reply) => {
    const community = await prisma.community.findUnique({ where: { id: req.params.id } });
    if (!community) return reply.code(404).send({ error: 'not_found' });

    const { limit = 50, offset = 0 } = req.query || {};
    const [items, count] = await Promise.all([
      prisma.communityMember.findMany({
        where: { communityId: req.params.id },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true, role: true } }
        },
        orderBy: { joinedAt: 'asc' },
        take: Math.min(Number(limit), 200),
        skip: Number(offset),
      }),
      prisma.communityMember.count({ where: { communityId: req.params.id } })
    ]);

    return { count, items };
  });
}
