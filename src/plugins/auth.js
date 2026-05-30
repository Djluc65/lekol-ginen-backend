import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { env } from '../env.js';

export default fp(async function authPlugin(fastify) {
  fastify.register(fastifyJwt, {
    secret: { private: env.jwtSecret, public: env.jwtSecret },
    sign: { expiresIn: env.jwtTtl },
  });

  fastify.decorate('authenticate', async function (req, reply) {
    try {
      await req.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  fastify.decorate('requireRole', function (...roles) {
    return async function (req, reply) {
      try {
        await req.jwtVerify();
        if (!roles.includes(req.user.role)) {
          return reply.code(403).send({ error: 'Forbidden', need: roles });
        }
      } catch (err) {
        reply.code(401).send({ error: 'Unauthorized' });
      }
    };
  });
});
