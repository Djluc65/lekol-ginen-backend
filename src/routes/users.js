import { prisma } from '../db.js';

export default async function usersRoutes(fastify) {
  // --- PUBLIC PROFIL ---
  fastify.get('/:username', async (req, reply) => {
    let viewerId = null;
    try {
      if (req.headers?.authorization) {
        await req.jwtVerify();
        viewerId = req.user?.sub || null;
      }
    } catch (_err) {
      viewerId = null;
    }

    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            posts: true,
            followers: true,
            following: true
          }
        }
      }
    });

    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    const followedByMe = viewerId
      ? (await prisma.follow.count({ where: { followerId: viewerId, followingId: user.id } })) > 0
      : false;

    return { ...user, followedByMe };
  });

  fastify.post('/:username/follow', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const target = await prisma.user.findUnique({ where: { username: req.params.username } });
    if (!target) return reply.code(404).send({ error: 'user_not_found' });
    if (req.user.sub === target.id) return reply.code(400).send({ error: 'cannot_follow_self' });

    try {
      await prisma.$transaction([
        prisma.follow.create({
          data: {
            followerId: req.user.sub,
            followingId: target.id
          }
        }),
        prisma.notification.create({
          data: {
            userId: target.id,
            type: 'follow',
            actorId: req.user.sub,
          }
        })
      ]);
      return { ok: true };
    } catch (_err) {
      return { ok: true };
    }
  });

  fastify.delete('/:username/follow', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const target = await prisma.user.findUnique({ where: { username: req.params.username } });
    if (!target) return reply.code(404).send({ error: 'user_not_found' });

    await prisma.follow.deleteMany({
      where: {
        followerId: req.user.sub,
        followingId: target.id
      }
    });
    return { ok: true };
  });

  // --- FEED (FOLLOWED USERS) ---
  fastify.get('/me/feed', { onRequest: [fastify.authenticate] }, async (req) => {
    const { limit = 50, offset = 0, communityId } = req.query || {};
    const following = await prisma.follow.findMany({
      where: { followerId: req.user.sub },
      select: { followingId: true }
    });

    const followingIds = following.map(f => f.followingId);
    const authorIds = Array.from(new Set([req.user.sub, ...followingIds]));

    const posts = await prisma.post.findMany({
      where: {
        authorId: { in: authorIds },
        isPublished: true,
        ...(communityId ? { communityId } : {})
      },
      include: {
        author: {
          select: { id: true, username: true, displayName: true, avatarUrl: true }
        },
        likes: {
          where: { userId: req.user.sub },
          select: { userId: true }
        },
        _count: { select: { comments: true, likes: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit), 100),
      skip: Number(offset),
    });

    const total = await prisma.post.count({
      where: {
        authorId: { in: authorIds },
        isPublished: true,
        ...(communityId ? { communityId } : {})
      }
    });

    const shaped = posts.map((p) => {
      const likedByMe = Array.isArray(p.likes) && p.likes.length > 0;
      const { likes, ...rest } = p;
      return {
        ...rest,
        mediaUrls: p.mediaUrls ? (() => { try { return JSON.parse(p.mediaUrls); } catch (_e) { return []; } })() : [],
        tags: p.tags ? (() => { try { return JSON.parse(p.tags); } catch (_e) { return []; } })() : [],
        likedByMe,
      };
    });

    return { count: total, items: shaped };
  });

  // --- LIST USERS (FOR COMMUNITY) ---
  fastify.get('/', async (req) => {
    const { limit = 20, offset = 0 } = req.query;
    const [items, count] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          bio: true,
          role: true,
          _count: { select: { posts: true } }
        },
        take: Number(limit),
        skip: Number(offset),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count()
    ]);

    return { count, items };
  });
}
