import { prisma } from '../db.js';

export default async function usersRoutes(fastify) {
  // --- PUBLIC PROFIL ---
  fastify.get('/:username', async (req, reply) => {
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
    return user;
  });

  // --- FOLLOW/UNFOLLOW ---
  fastify.post('/:id/follow', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (req.user.sub === req.params.id) {
      return reply.code(400).send({ error: 'cannot_follow_self' });
    }

    try {
      await prisma.follow.create({
        data: {
          followerId: req.user.sub,
          followingId: req.params.id
        }
      });
      return { ok: true };
    } catch (err) {
      return { ok: true };
    }
  });

  fastify.delete('/:id/follow', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    await prisma.follow.deleteMany({
      where: {
        followerId: req.user.sub,
        followingId: req.params.id
      }
    });
    return { ok: true };
  });

  // --- FEED (FOLLOWED USERS) ---
  fastify.get('/me/feed', { onRequest: [fastify.authenticate] }, async (req) => {
    const following = await prisma.follow.findMany({
      where: { followerId: req.user.sub },
      select: { followingId: true }
    });

    const followingIds = following.map(f => f.followingId);

    const posts = await prisma.post.findMany({
      where: {
        authorId: { in: followingIds },
        isPublished: true
      },
      include: {
        author: {
          select: { id: true, username: true, displayName: true, avatarUrl: true }
        },
        _count: { select: { comments: true, likes: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    return { items: posts };
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
