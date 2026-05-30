import { prisma } from '../db.js';

function toPublicJSON(user) {
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

export default async function meRoutes(fastify) {
  fastify.get('/', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub }
    });
    if (!user) return reply.code(404).send({ error: 'not_found' });
    return { user: toPublicJSON(user) };
  });

  fastify.patch('/', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const allowed = ['displayName', 'bio', 'avatarUrl', 'lang', 'theme'];
    const data = {};
    for (const k of allowed) {
      if (k in (req.body || {})) data[k] = req.body[k];
    }
    
    try {
      const user = await prisma.user.update({
        where: { id: req.user.sub },
        data
      });
      return { user: toPublicJSON(user) };
    } catch (err) {
      return reply.code(404).send({ error: 'not_found' });
    }
  });
}
