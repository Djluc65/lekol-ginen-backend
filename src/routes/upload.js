import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import { env } from '../env.js';

if (env.cloudinaryUrl) {
  cloudinary.config({
    cloudinary_url: env.cloudinaryUrl,
  });
}

export default async function uploadRoutes(fastify) {
  fastify.post('/avatar', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (!env.cloudinaryUrl) {
      return reply.code(503).send({ error: 'cloudinary_not_configured' });
    }

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'no_file' });

    try {
      // Process with sharp
      const buffer = await data.toBuffer();
      const processed = await sharp(buffer)
        .resize(400, 400, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer();

      // Upload to cloudinary
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'lekol-ginen/avatars',
            public_id: `avatar_${req.user.sub}`,
            overwrite: true,
            resource_type: 'image',
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(processed);
      });

      return {
        url: result.secure_url,
        public_id: result.public_id,
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'upload_failed' });
    }
  });

  fastify.post('/image', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (!env.cloudinaryUrl) {
      return reply.code(503).send({ error: 'cloudinary_not_configured' });
    }

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'no_file' });

    try {
      const buffer = await data.toBuffer();
      
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'lekol-ginen/posts',
            resource_type: 'image',
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(buffer);
      });

      return {
        url: result.secure_url,
        public_id: result.public_id,
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'upload_failed' });
    }
  });

  fastify.post('/video', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (!env.cloudinaryUrl) {
      return reply.code(503).send({ error: 'cloudinary_not_configured' });
    }

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'no_file' });

    try {
      const buffer = await data.toBuffer();
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'lekol-ginen/posts',
            resource_type: 'video',
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(buffer);
      });

      return {
        url: result.secure_url,
        public_id: result.public_id,
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'upload_failed' });
    }
  });

  fastify.post('/audio', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (!env.cloudinaryUrl) {
      return reply.code(503).send({ error: 'cloudinary_not_configured' });
    }

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'no_file' });

    try {
      const buffer = await data.toBuffer();
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'lekol-ginen/posts',
            resource_type: 'video',
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(buffer);
      });

      return {
        url: result.secure_url,
        public_id: result.public_id,
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'upload_failed' });
    }
  });

  fastify.post('/file', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (!env.cloudinaryUrl) {
      return reply.code(503).send({ error: 'cloudinary_not_configured' });
    }

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'no_file' });

    try {
      const buffer = await data.toBuffer();
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'lekol-ginen/files',
            resource_type: 'raw',
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(buffer);
      });

      return {
        url: result.secure_url,
        public_id: result.public_id,
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'upload_failed' });
    }
  });
}
