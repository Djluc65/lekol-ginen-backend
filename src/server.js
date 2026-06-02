import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { env } from './env.js';
import { connectDb } from './db.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import lwaRoutes from './routes/lwa.js';
import worksRoutes from './routes/works.js';
import oracleRoutes from './routes/oracle.js';
import contentRoutes from './routes/content.js';
import uploadRoutes from './routes/upload.js';
import postsRoutes from './routes/posts.js';
import usersRoutes from './routes/users.js';
import searchRoutes from './routes/search.js';
import communitiesRoutes from './routes/communities.js';
import notificationsRoutes from './routes/notifications.js';
import { initMeilisearch } from './lib/meilisearch.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../../');

async function build() {
  const fastify = Fastify({
    logger: env.nodeEnv === 'development' ? { transport: { target: 'pino-pretty' } } : true,
    trustProxy: true,
  });

  await fastify.register(sensible);
  await fastify.register(cookie, {
    secret: env.jwtSecret,
    parseOptions: {}
  });
  await fastify.register(cors, { origin: env.corsOrigin, credentials: true });
  await fastify.register(rateLimit, { max: env.rateLimitMax, timeWindow: env.rateLimitWindow });
  await fastify.register(multipart, { limits: { fileSize: 8 * 1024 * 1024 } });

  const imageDir = resolve(ROOT_DIR, 'Image');
  if (existsSync(imageDir)) {
    await fastify.register(fastifyStatic, {
      root: imageDir,
      prefix: '/images/',
      decorateReply: false,
    });
  }

  if (env.nodeEnv === 'production') {
    const frontendDist = resolve(ROOT_DIR, 'frontend/dist');
    await fastify.register(fastifyStatic, {
      root: frontendDist,
      prefix: '/',
    });
  }

  await fastify.register(authPlugin);

  fastify.get('/health', async () => ({ ok: true, service: 'lekol-ginen-backend', env: env.nodeEnv, time: new Date().toISOString() }));

  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(meRoutes, { prefix: '/api/me' });
  await fastify.register(lwaRoutes, { prefix: '/api/lwa' });
  await fastify.register(worksRoutes, { prefix: '/api/works' });
  await fastify.register(oracleRoutes, { prefix: '/api/oracle' });
  await fastify.register(contentRoutes, { prefix: '/api/content' });
  await fastify.register(uploadRoutes, { prefix: '/api/upload' });
  await fastify.register(postsRoutes, { prefix: '/api/posts' });
  await fastify.register(usersRoutes, { prefix: '/api/users' });
  await fastify.register(communitiesRoutes, { prefix: '/api/communities' });
  await fastify.register(notificationsRoutes, { prefix: '/api/notifications' });
  await fastify.register(searchRoutes, { prefix: '/api/search' });

  return fastify;
}

async function start() {
  try {
    await connectDb();
    await initMeilisearch();
    const app = await build();
    await app.listen({ port: env.port, host: '0.0.0.0' });
    app.log.info(`Lekòl Ginen backend ready on :${env.port}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
