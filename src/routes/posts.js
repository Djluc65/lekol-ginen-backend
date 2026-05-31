import { prisma } from '../db.js';
import { z } from 'zod';

const postSchema = z.object({
  type: z.enum(['text', 'image', 'audio', 'video', 'work', 'article']),
  title: z.string().optional(),
  body: z.string().optional(),
  mediaUrls: z.array(z.string()).optional(),
  lwaId: z.string().optional(),
  communityId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  lang: z.string().default('fr'),
});

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return String(value).split(',').map((s) => s.trim()).filter(Boolean);
  }
}

export default async function postsRoutes(fastify) {
  // --- LIST POSTS ---
  fastify.get('/', async (req) => {
    const { authorId, lwaId, communityId, type, lang, limit = 20, offset = 0 } = req.query;
    const where = { isPublished: true };
    if (authorId) where.authorId = authorId;
    if (lwaId) where.lwaId = lwaId;
    if (communityId) where.communityId = communityId;
    if (type) where.type = type;
    if (lang) where.lang = lang;

    let viewerId = null;
    try {
      if (req.headers?.authorization) {
        await req.jwtVerify();
        viewerId = req.user?.sub || null;
      }
    } catch (_err) {
      viewerId = null;
    }

    const include = {
      author: {
        select: { id: true, username: true, displayName: true, avatarUrl: true }
      },
      community: {
        select: { id: true, name: true, slug: true }
      },
      _count: { select: { comments: true, likes: true } },
    };
    if (viewerId) {
      include.likes = {
        where: { userId: viewerId },
        select: { userId: true }
      };
    }

    const [items, count] = await Promise.all([
      prisma.post.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
      prisma.post.count({ where })
    ]);

    const shaped = items.map((p) => {
      const likedByMe = viewerId ? Array.isArray(p.likes) && p.likes.length > 0 : false;
      const { likes, mediaUrls, tags, ...rest } = p;
      return {
        ...rest,
        likedByMe,
        mediaUrls: parseJsonArray(mediaUrls),
        tags: parseJsonArray(tags),
      };
    });

    return { count, items: shaped };
  });

  // --- CREATE POST ---
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });

    if (parsed.data.communityId) {
      const membership = await prisma.communityMember.findUnique({
        where: { communityId_userId: { communityId: parsed.data.communityId, userId: req.user.sub } }
      });
      if (!membership || membership.role === 'banned') return reply.code(403).send({ error: 'forbidden' });
    }

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
        },
        community: {
          select: { id: true, name: true, slug: true }
        },
      }
    });

    if (parsed.data.communityId) {
      await prisma.community.update({
        where: { id: parsed.data.communityId },
        data: { postsCount: { increment: 1 } }
      });
    }

    return {
      ...post,
      mediaUrls: parseJsonArray(post.mediaUrls),
      tags: parseJsonArray(post.tags),
      likedByMe: false,
    };
  });

  // --- GET SINGLE POST ---
  fastify.get('/:id', async (req, reply) => {
    let viewerId = null;
    try {
      if (req.headers?.authorization) {
        await req.jwtVerify();
        viewerId = req.user?.sub || null;
      }
    } catch (_err) {
      viewerId = null;
    }

    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: {
        author: {
          select: { id: true, username: true, displayName: true, avatarUrl: true }
        },
        community: {
          select: { id: true, name: true, slug: true }
        },
        comments: {
          include: {
            author: { select: { id: true, username: true, displayName: true, avatarUrl: true } }
          },
          orderBy: { createdAt: 'asc' }
        },
        _count: { select: { likes: true, comments: true } },
        likes: viewerId
          ? { where: { userId: viewerId }, select: { userId: true } }
          : false,
      }
    });

    if (!post) return reply.code(404).send({ error: 'not_found' });
    const likedByMe = viewerId ? Array.isArray(post.likes) && post.likes.length > 0 : false;
    const { likes, mediaUrls, tags, ...rest } = post;
    return {
      ...rest,
      likedByMe,
      mediaUrls: parseJsonArray(mediaUrls),
      tags: parseJsonArray(tags),
    };
  });

  fastify.get('/:id/comments', async (req, reply) => {
    const { limit = 50, offset = 0 } = req.query || {};
    const post = await prisma.post.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!post) return reply.code(404).send({ error: 'not_found' });

    const [items, count] = await Promise.all([
      prisma.comment.findMany({
        where: { postId: req.params.id },
        include: {
          author: { select: { id: true, username: true, displayName: true, avatarUrl: true } }
        },
        orderBy: { createdAt: 'asc' },
        take: Math.min(Number(limit), 100),
        skip: Number(offset),
      }),
      prisma.comment.count({ where: { postId: req.params.id } })
    ]);

    return { count, items };
  });

  fastify.post('/:id/comments', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const bodySchema = z.object({ body: z.string().min(1).max(5000) });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });

    const post = await prisma.post.findUnique({ where: { id: req.params.id }, select: { id: true, authorId: true } });
    if (!post) return reply.code(404).send({ error: 'not_found' });

    const comment = await prisma.comment.create({
      data: {
        postId: req.params.id,
        authorId: req.user.sub,
        body: parsed.data.body,
      },
      include: {
        author: { select: { id: true, username: true, displayName: true, avatarUrl: true } }
      }
    });

    if (post.authorId && post.authorId !== req.user.sub) {
      await prisma.notification.create({
        data: {
          userId: post.authorId,
          type: 'comment',
          actorId: req.user.sub,
          postId: post.id,
          data: JSON.stringify({ commentId: comment.id })
        }
      });
    }

    return reply.code(201).send(comment);
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
