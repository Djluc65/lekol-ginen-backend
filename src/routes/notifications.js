import { prisma } from '../db.js';

export default async function notificationsRoutes(fastify) {
  fastify.get('/', { onRequest: [fastify.authenticate] }, async (req) => {
    const { limit = 20, offset = 0, unread } = req.query || {};
    const where = {
      userId: req.user.sub,
      ...(unread === '1' || unread === 'true' ? { readAt: null } : {}),
    };

    const [items, count] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(limit), 100),
        skip: Number(offset),
        include: {
          actor: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          post: { select: { id: true, title: true, type: true } },
          community: { select: { id: true, name: true, slug: true } },
        }
      }),
      prisma.notification.count({ where })
    ]);

    return { count, items };
  });

  fastify.post('/:id/read', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const n = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!n || n.userId !== req.user.sub) return reply.code(404).send({ error: 'not_found' });
    await prisma.notification.update({
      where: { id: req.params.id },
      data: { readAt: new Date() }
    });
    return { ok: true };
  });

  fastify.post('/read-all', { onRequest: [fastify.authenticate] }, async (req) => {
    await prisma.notification.updateMany({
      where: { userId: req.user.sub, readAt: null },
      data: { readAt: new Date() }
    });
    return { ok: true };
  });
}

