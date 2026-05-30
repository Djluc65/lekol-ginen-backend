import { prisma } from '../db.js';
import { z } from 'zod';

const postSchema = z.object({
  type: z.enum(['text', 'image', 'audio', 'video', 'work', 'article']),
  title: z.string().optional(),
  body: z.string().optional(),
  mediaUrls: z.array(z.string()).optional(),
  lwaId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  lang: z.string().default('fr'),
});

export default async function postsRoutes(fastify) {
  // --- LIST POSTS ---
  fastify.get('/', async (req) => {
    const { authorId, lwaId, type, lang, limit = 20, offset = 0 } = req.query;
    const where = { isPublished: true };
    if (authorId) where.authorId = authorId;
    if (lwaId) where.lwaId = lwaId;
    if (type) where.type = type;
    if (lang) where.lang = lang;

    const [items, count] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          author: {
            select: { id: true, username: true, displayName: true, avatarUrl: true }
          },
          _count: { select: { comments: true, likes: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
      prisma.post.count({ where })
    ]);

    return { count, items };
  });

  // --- CREATE POST ---
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });

    const post = await prisma.post.create({
      data: {
        ...parsed.data,
        authorId: req.user.sub,
        mediaUrls: parsed.data.mediaUrls ? JSON.stringify(parsed.data.mediaUrls) : null,
        tags: parsed.data.tags ? JSON.stringify(parsed.data.tags) : null,
      },
      include: {
        author: {
          select: { id: true, username: true, displayName: true, avatarUrl: true }
        }
      }
    });

    return post;
  });

  // --- GET SINGLE POST ---
  fastify.get('/:id', async (req, reply) => {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: {
        author: {
          select: { id: true, username: true, displayName: true, avatarUrl: true }
        },
        comments: {
          include: {
            author: { select: { id: true, username: true, displayName: true, avatarUrl: true } }
          },
          orderBy: { createdAt: 'asc' }
        },
        _count: { select: { likes: true } }
      }
    });

    if (!post) return reply.code(404).send({ error: 'not_found' });
    return post;
  });

  // --- LIKE/UNLIKE ---
  fastify.post('/:id/like', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    try {
      await prisma.like.create({
        data: {
          userId: req.user.sub,
          postId: req.params.id
        }
      });
      return { ok: true };
    } catch (err) {
      // already liked or error
      return { ok: true };
    }
  });

  fastify.delete('/:id/like', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    await prisma.like.deleteMany({
      where: {
        userId: req.user.sub,
        postId: req.params.id
      }
    });
    return { ok: true };
  });
}
