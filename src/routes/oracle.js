import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { env } from '../env.js';
import { OracleLog } from '../models/OracleLog.js';

const askBody = z.object({
  prompt: z.string().min(2).max(2000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .max(20)
    .optional(),
});

const SYSTEM_PROMPT = `Tu es l'Oracle de Lekòl Ginen, gardien numérique de la mémoire spirituelle du Vodou ayisyen (Ginen).
Ton rôle :
- répondre avec respect, sobriété et précision culturelle ;
- citer les familles de lwa (Rada, Nago/Ogou, Petro, Kongo, Gede) quand pertinent ;
- distinguer le contexte ethnographique du conseil personnel — tu ne fais pas de divination réelle, tu donnes du contexte ;
- refuser poliment toute demande qui caricature, ridiculise ou détourne la tradition ;
- toujours rappeler que les rituels authentiques se vivent en lakou auprès d'un·e oungan ou manbo, pas en ligne ;
- répondre dans la langue de la question (français par défaut, kreyòl si la question est en kreyòl).

Sois bref (3-6 phrases max) sauf si l'utilisateur demande explicitement plus.`;

export default async function oracleRoutes(fastify) {
  fastify.post('/ask', async (req, reply) => {
    const parsed = askBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

    if (!env.anthropicApiKey) {
      const fallback = "L'oracle n'est pas configuré sur ce serveur (ANTHROPIC_API_KEY manquante). Demande à l'administrateur d'ajouter la clé pour activer les réponses en direct.";
      await OracleLog.create({ prompt: parsed.data.prompt, response: fallback, error: 'no_api_key' });
      return { response: fallback, fallback: true };
    }

    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const messages = [
      ...(parsed.data.history || []),
      { role: 'user', content: parsed.data.prompt },
    ];

    let userId = null;
    try {
      await req.jwtVerify();
      userId = req.user?.sub || null;
    } catch (_) {
      // anonymous ok
    }

    try {
      const result = await client.messages.create({
        model: env.anthropicModel,
        max_tokens: 600,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages,
      });
      const text = result.content?.map((c) => (c.type === 'text' ? c.text : '')).join('') || '';
      const usage = result.usage || {};
      const cacheHit = (usage.cache_read_input_tokens || 0) > 0;
      await OracleLog.create({
        userId,
        prompt: parsed.data.prompt,
        response: text,
        tokensIn: usage.input_tokens || 0,
        tokensOut: usage.output_tokens || 0,
        model: env.anthropicModel,
        cacheHit,
      });
      return { response: text, usage, cacheHit };
    } catch (err) {
      fastify.log.error({ err }, 'oracle.ask failed');
      await OracleLog.create({ userId, prompt: parsed.data.prompt, error: String(err?.message || err) });
      return reply.code(502).send({ error: 'oracle_failed', message: String(err?.message || err) });
    }
  });

  // --- CHAT (STREAMING SSE) ---
  fastify.post('/chat', async (req, reply) => {
    const parsed = askBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

    if (!env.anthropicApiKey) {
      return reply.code(503).send({ error: 'api_key_missing' });
    }

    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const messages = [
      ...(parsed.data.history || []),
      { role: 'user', content: parsed.data.prompt },
    ];

    let userId = null;
    try {
      await req.jwtVerify();
      userId = req.user?.sub || null;
    } catch (_) {}

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');

    let fullText = '';
    try {
      const stream = await client.messages.stream({
        model: env.anthropicModel,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
      });

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta') {
          const text = chunk.delta.text;
          fullText += text;
          reply.raw.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }

      // Log the interaction
      await OracleLog.create({
        userId,
        prompt: parsed.data.prompt,
        response: fullText,
        model: env.anthropicModel,
      });

      reply.raw.write(`data: [DONE]\n\n`);
      reply.raw.end();
    } catch (err) {
      fastify.log.error({ err }, 'oracle.chat streaming failed');
      reply.raw.write(`data: ${JSON.stringify({ error: 'streaming_failed' })}\n\n`);
      reply.raw.end();
    }
  });
}
