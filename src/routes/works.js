import { z } from 'zod';
import { Work } from '../models/Work.js';

const workBody = z.object({
  type: z.enum(['artwork', 'music', 'writing', 'research', 'testimony']),
  title: z.string().min(2).max(200),
  body: z.any().optional(),
  lwaSlug: z.string().nullable().optional(),
  mediaUrls: z.array(z.string().url()).optional(),
  tags: z.array(z.string()).optional(),
  published: z.boolean().optional(),
});

export default async function worksRoutes(fastify) {
  fastify.get('/', async (req) => {
    const { lwaSlug, authorId, type, tag, limit = 50, page = 1 } = req.query || {};
    const filter = { published: true };
    if (lwaSlug) filter.lwaSlug = lwaSlug;
    if (authorId) filter.authorId = authorId;
    if (type) filter.type = type;
    if (tag) filter.tags = tag;
    const skip = (Math.max(1, Number(page)) - 1) * Math.min(Number(limit), 100);
    const items = await Work.find(filter)
      .sort({ publishedAt: -1 })
      .limit(Math.min(Number(limit), 100))
      .skip(skip)
      .populate('authorId', 'username displayName avatarUrl role')
      .lean();
    return { count: items.length, items };
  });

  fastify.get('/:id', async (req, reply) => {
    const work = await Work.findById(req.params.id)
      .populate('authorId', 'username displayName avatarUrl role')
      .lean();
    if (!work) return reply.code(404).send({ error: 'not_found' });
    return work;
  });

  fastify.post(
    '/',
    { onRequest: [fastify.requireRole('creator', 'admin')] },
    async (req, reply) => {
      const parsed = workBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
      const work = await Work.create({ ...parsed.data, authorId: req.user.sub });
      return reply.code(201).send(work.toObject());
    }
  );

  fastify.delete(
    '/:id',
    { onRequest: [fastify.authenticate] },
    async (req, reply) => {
      const work = await Work.findById(req.params.id);
      if (!work) return reply.code(404).send({ error: 'not_found' });
      if (work.authorId.toString() !== req.user.sub && req.user.role !== 'admin') {
        return reply.code(403).send({ error: 'forbidden' });
      }
      await work.deleteOne();
      return { ok: true };
    }
  );
}
