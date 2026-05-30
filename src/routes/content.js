/* Endpoints de contenu éditorial (lecture seule) : histoire, plantes, rêves,
   audio, oracle seed. Servis depuis data.jsx, pas depuis Mongo — ces données
   sont stables, peu volumineuses, et facilement éditables à la main. */

import { legacyData } from '../lib/legacy-data.js';

const { HISTORY, PLANTS, DREAMS, AUDIO_CATS, ORACLE_SEED, ENCYCLOPEDIA } = legacyData;

function foldText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export default async function contentRoutes(fastify) {
  fastify.get('/history', async () => ({ count: HISTORY.length, items: HISTORY }));

  fastify.get('/plants', async (req) => {
    const { tag } = req.query || {};
    const items = tag ? PLANTS.filter((p) => p.tags?.includes(tag)) : PLANTS;
    return { count: items.length, items };
  });

  fastify.get('/dreams', async (req) => {
    const { tag, q } = req.query || {};
    const needle = (q || '').toLowerCase();
    const items = DREAMS.filter((d) => {
      if (tag && tag !== 'all' && d.tag !== tag) return false;
      if (needle && !(`${d.sym} ${d.meaning} ${d.lwa}`.toLowerCase().includes(needle))) return false;
      return true;
    });
    return { count: items.length, items };
  });

  fastify.get('/audio', async () => ({ count: AUDIO_CATS.length, items: AUDIO_CATS }));

  fastify.get('/oracle-seed', async () => ({ count: ORACLE_SEED.length, items: ORACLE_SEED }));

  fastify.get('/encyclopedia/categories', async () => {
    const categories = Array.from(new Set((ENCYCLOPEDIA || []).map((c) => c.category).filter(Boolean))).sort();
    return { count: categories.length, categories };
  });

  fastify.get('/encyclopedia/:id', async (req, reply) => {
    const id = String(req.params.id || '').trim();
    const item = (ENCYCLOPEDIA || []).find((c) => c.id === id);
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return item;
  });

  fastify.get('/encyclopedia', async (req) => {
    const { q, category, limit = 50, offset = 0 } = req.query || {};
    const needle = foldText(q);
    const cat = foldText(category);
    const nLimit = Math.min(Number(limit) || 50, 200);
    const nOffset = Math.max(Number(offset) || 0, 0);

    const filtered = (ENCYCLOPEDIA || []).filter((c) => {
      if (cat && foldText(c.category) !== cat) return false;
      if (!needle) return true;
      const hay = `${c.term} ${c.category} ${c.subtitle} ${c.definition} ${(c.approaches || []).join(' ')} ${(c.formulas || []).join(' ')} ${c.citation} ${c.citationSource}`;
      return foldText(hay).includes(needle);
    });

    return { count: filtered.length, items: filtered.slice(nOffset, nOffset + nLimit) };
  });
}
