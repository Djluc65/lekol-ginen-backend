import { meilisearch } from '../lib/meilisearch.js';
import { legacyData } from '../lib/legacy-data.js';

function foldText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function includesFolded(haystack, needle) {
  if (!needle) return false;
  return foldText(haystack).includes(needle);
}

function normalizeLegacyLwaItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id ?? raw.slug ?? raw._id;
  if (!id) return null;
  return {
    id,
    name: raw.name ?? '',
    family: raw.family ?? '',
    title: raw.title ?? {},
    story: raw.story ?? {},
    domain: raw.domain ?? {},
    elements: Array.isArray(raw.elements) ? raw.elements : [],
  };
}

function legacySearchLwa(query, limit) {
  const q = foldText(query);
  if (!q) return [];
  if (q === 'lwa' || q === 'lwas') {
    const items = Array.isArray(legacyData?.LWA) ? legacyData.LWA : [];
    return items.slice(0, limit).map(normalizeLegacyLwaItem).filter(Boolean);
  }
  const items = Array.isArray(legacyData?.LWA) ? legacyData.LWA : [];
  const extra = Array.isArray(legacyData?.LWA_FICHES) ? legacyData.LWA_FICHES : [];
  const extraItems = extra
    .filter((f) => !f.isGroup)
    .map((f) => ({
      id: f.id,
      name: f.name,
      family: (f.nanchon || '').split('/')[0].trim() || '',
      title: { fr: f.domain ? String(f.domain).split(',')[0].trim() : '' },
      story: { fr: f.note || '' },
      domain: { fr: f.domain || '' },
      elements: [],
    }));
  const allItems = items.concat(extraItems);
  const hits = [];
  for (const raw of allItems) {
    const item = normalizeLegacyLwaItem(raw);
    if (!item) continue;
    const hay = `${item.id} ${item.name} ${item.family} ${item.title?.fr ?? ''} ${item.title?.ht ?? ''} ${item.title?.en ?? ''} ${item.domain?.fr ?? ''} ${item.domain?.ht ?? ''} ${item.domain?.en ?? ''} ${item.story?.fr ?? ''} ${item.story?.ht ?? ''} ${item.story?.en ?? ''}`;
    if (!includesFolded(hay, q)) continue;
    hits.push(item);
    if (hits.length >= limit) break;
  }
  return hits;
}

function legacySearchDreams(query, limit) {
  const q = foldText(query);
  if (!q) return [];
  const items = Array.isArray(legacyData?.DREAMS) ? legacyData.DREAMS : [];
  if (q === 'reve' || q === 'reves' || q === 'dream' || q === 'dreams') {
    return items.slice(0, limit).map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const sym = raw.sym ?? '';
      const meaning = raw.meaning ?? '';
      const lwa = raw.lwa ?? '';
      const tag = raw.tag ?? '';
      return { id: `${tag}:${sym}`, sym, meaning, lwa, tag };
    }).filter(Boolean);
  }
  const hits = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const sym = raw.sym ?? '';
    const meaning = raw.meaning ?? '';
    const lwa = raw.lwa ?? '';
    const tag = raw.tag ?? '';
    const hay = `${sym} ${meaning} ${lwa} ${tag}`;
    if (!includesFolded(hay, q)) continue;
    hits.push({ id: `${tag}:${sym}`, sym, meaning, lwa, tag });
    if (hits.length >= limit) break;
  }
  return hits;
}

function legacySearchPlants(query, limit) {
  const q = foldText(query);
  if (!q) return [];
  const items = Array.isArray(legacyData?.PLANTS) ? legacyData.PLANTS : [];
  if (q === 'plante' || q === 'plantes' || q === 'plant' || q === 'plants') {
    return items.slice(0, limit).map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const id = raw.id ?? raw.creole ?? raw.sci;
      if (!id) return null;
      const creole = raw.creole ?? '';
      const sci = raw.sci ?? '';
      const uses = raw.uses ?? '';
      const symbol = raw.symbol ?? '';
      const caution = raw.caution ?? '';
      const tags = Array.isArray(raw.tags) ? raw.tags : [];
      const swatch = raw.swatch ?? '';
      return { id, creole, sci, uses, symbol, caution, tags, swatch };
    }).filter(Boolean);
  }
  const hits = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const id = raw.id ?? raw.creole ?? raw.sci;
    if (!id) continue;
    const creole = raw.creole ?? '';
    const sci = raw.sci ?? '';
    const uses = raw.uses ?? '';
    const symbol = raw.symbol ?? '';
    const caution = raw.caution ?? '';
    const tags = Array.isArray(raw.tags) ? raw.tags : [];
    const swatch = raw.swatch ?? '';
    const hay = `${id} ${creole} ${sci} ${uses} ${symbol} ${caution} ${tags.join(' ')}`;
    if (!includesFolded(hay, q)) continue;
    hits.push({ id, creole, sci, uses, symbol, caution, tags, swatch });
    if (hits.length >= limit) break;
  }
  return hits;
}

function legacySearchHistory(query, limit) {
  const q = foldText(query);
  if (!q) return [];
  const items = Array.isArray(legacyData?.HISTORY) ? legacyData.HISTORY : [];
  if (q === 'histoire' || q === 'history') {
    return items.slice(0, limit).map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const year = raw.year ?? '';
      const title = raw.title ?? '';
      const body = raw.body ?? '';
      return { id: `${year}:${title}`, year, title, body };
    }).filter(Boolean);
  }
  const hits = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const year = raw.year ?? '';
    const title = raw.title ?? '';
    const body = raw.body ?? '';
    const hay = `${year} ${title} ${body}`;
    if (!includesFolded(hay, q)) continue;
    hits.push({ id: `${year}:${title}`, year, title, body });
    if (hits.length >= limit) break;
  }
  return hits;
}

function legacySearchAudio(query, limit) {
  const q = foldText(query);
  if (!q) return [];
  const items = Array.isArray(legacyData?.AUDIO_CATS) ? legacyData.AUDIO_CATS : [];
  if (q === 'audio' || q === 'audios' || q === 'chant' || q === 'chants' || q === 'song' || q === 'songs') {
    return items.slice(0, limit).map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const id = raw.id ?? raw.title;
      if (!id) return null;
      const title = raw.title ?? '';
      const dur = raw.dur ?? '';
      const desc = raw.desc ?? '';
      return { id, title, dur, desc };
    }).filter(Boolean);
  }
  const hits = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const id = raw.id ?? raw.title;
    if (!id) continue;
    const title = raw.title ?? '';
    const dur = raw.dur ?? '';
    const desc = raw.desc ?? '';
    const hay = `${id} ${title} ${dur} ${desc}`;
    if (!includesFolded(hay, q)) continue;
    hits.push({ id, title, dur, desc });
    if (hits.length >= limit) break;
  }
  return hits;
}

function legacySearchConcepts(query, limit) {
  const q = foldText(query);
  if (!q) return [];
  const items = Array.isArray(legacyData?.ENCYCLOPEDIA) ? legacyData.ENCYCLOPEDIA : [];
  if (q === 'vodou' || q === 'vodoo' || q === 'vodo' || q === 'encyclopedie' || q === 'encyclopédie') {
    return items.slice(0, limit);
  }
  const hits = [];
  for (const c of items) {
    const hay = `${c.term} ${c.category} ${c.subtitle} ${c.definition} ${(c.approaches || []).join(' ')} ${(c.formulas || []).join(' ')} ${c.citation} ${c.citationSource}`;
    if (!includesFolded(hay, q)) continue;
    hits.push(c);
    if (hits.length >= limit) break;
  }
  return hits;
}

function legacySearchRituals(query, limit) {
  const q = foldText(query);
  if (!q) return [];
  const items = Array.isArray(legacyData?.RITUALS) ? legacyData.RITUALS : [];
  if (q === 'rituel' || q === 'rituels' || q === 'ritual' || q === 'rituals' || q === 'pratique' || q === 'pratiques') {
    return items.slice(0, limit);
  }
  const n = (s) => foldText(s);

  const score = (r) => {
    const qn = q;
    if (!qn) return 1;
    let sc = 0;
    const title = n(r.title ?? r.name ?? '');
    const sub = n(r.sub ?? '');
    const resume = n(r.resume ?? '');
    const lwa = n(r.lwa ?? '');
    const cat = n(r.cat ?? r.tag ?? '');
    if (title.includes(qn)) sc += 10;
    if (sub.includes(qn)) sc += 2;
    if (lwa.includes(qn)) sc += 3;
    if (resume.includes(qn)) sc += 1;
    if (cat.includes(qn)) sc += 1;

    const kw = Array.isArray(r.keywords) ? r.keywords : Array.isArray(r.kw) ? r.kw : [];
    for (const k of kw) {
      const kn = n(k);
      if (!kn) continue;
      if (kn === qn) sc += 8;
      else if (kn.includes(qn)) sc += 4;
      else if (qn.includes(kn) && kn.length > 3) sc += 2;
    }

    const details = n(r.details ?? '');
    const steps = Array.isArray(r.steps) ? r.steps.join(' ') : '';
    const ingredients = Array.isArray(r.ingredients) ? r.ingredients.join(' ') : '';
    const extra = `${details} ${steps} ${ingredients}`;
    if (n(extra).includes(qn)) sc += 1;
    return sc;
  };

  return items
    .map((r) => ({ r, sc: score(r || {}) }))
    .filter((x) => x.sc > 0)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, limit)
    .map((x) => x.r);
}

function legacySearchRecipes(query, limit) {
  const q = foldText(query);
  if (!q) return [];
  const items = Array.isArray(legacyData?.RECIPES) ? legacyData.RECIPES : [];
  if (q === 'recette' || q === 'recettes' || q === 'recipe' || q === 'recipes') {
    return items.slice(0, limit);
  }
  const n = (s) => foldText(s);

  const score = (r) => {
    const qn = q;
    if (!qn) return 1;
    let sc = 0;
    const title = n(r.title ?? r.name ?? '');
    const sub = n(r.sub ?? '');
    const lwa = n(r.lwa ?? '');
    const cat = n(r.cat ?? r.tag ?? '');
    const moment = n(r.moment ?? '');
    if (title.includes(qn)) sc += 10;
    if (sub.includes(qn)) sc += 2;
    if (lwa.includes(qn)) sc += 3;
    if (cat.includes(qn)) sc += 1;
    if (moment.includes(qn)) sc += 1;

    const kw = Array.isArray(r.keywords) ? r.keywords : Array.isArray(r.kw) ? r.kw : [];
    for (const k of kw) {
      const kn = n(k);
      if (!kn) continue;
      if (kn === qn) sc += 8;
      else if (kn.includes(qn)) sc += 4;
      else if (qn.includes(kn) && kn.length > 3) sc += 2;
    }

    const details = n(r.details ?? '');
    const steps = Array.isArray(r.steps) ? r.steps.join(' ') : '';
    const ingredients = Array.isArray(r.ingredients) ? r.ingredients.join(' ') : '';
    const extra = `${details} ${steps} ${ingredients}`;
    if (n(extra).includes(qn)) sc += 1;
    return sc;
  };

  return items
    .map((r) => ({ r, sc: score(r || {}) }))
    .filter((x) => x.sc > 0)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, limit)
    .map((x) => x.r);
}

function legacySearchSourceApproches(query, limit) {
  let q = foldText(query);
  if (!q) return [];
  const items = Array.isArray(legacyData?.SOURCE_APPROCHES) ? legacyData.SOURCE_APPROCHES : [];
  if (q === 'source' || q === 'la source' || q === 'bondye' || q === 'philosophie' || q === 'philosophies' || q === 'cosmologie') {
    return items.slice(0, limit);
  }
  const hits = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const kw = Array.isArray(it.keywords) ? it.keywords.join(' ') : '';
    const hay = `${it.title ?? ''} ${it.body ?? ''} ${kw}`;
    if (!includesFolded(hay, q)) continue;
    hits.push(it);
    if (hits.length >= limit) break;
  }
  return hits;
}

export default async function searchRoutes(fastify) {
  fastify.get('/', async (req, reply) => {
    const { q, limit = 20, type = 'lwa,posts,dreams,plants,history,audio,concepts,rituals,recipes,source' } = req.query;
    const numericLimit = Math.min(Number(limit) || 20, 50);
    
    const types = String(type)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const results = {};

    try {
      if (types.includes('dreams')) results.dreams = legacySearchDreams(q, numericLimit);
      if (types.includes('plants')) results.plants = legacySearchPlants(q, numericLimit);
      if (types.includes('history')) results.history = legacySearchHistory(q, numericLimit);
      if (types.includes('audio')) results.audio = legacySearchAudio(q, numericLimit);
      if (types.includes('concepts')) results.concepts = legacySearchConcepts(q, numericLimit);
      if (types.includes('rituals')) results.rituals = legacySearchRituals(q, numericLimit);
      if (types.includes('recipes')) results.recipes = legacySearchRecipes(q, numericLimit);
      if (types.includes('source')) results.source = legacySearchSourceApproches(q, numericLimit);

      if (!meilisearch) {
        if (types.includes('lwa')) results.lwa = legacySearchLwa(q, numericLimit);
        if (types.includes('posts')) results.posts = [];
        // The results for dreams, plants, history, audio, concepts, rituals, recipes, source 
        // are already populated above. We just need to return the full results object.
        return results;
      }

      const meiliTargets = types.filter((t) => t === 'lwa' || t === 'posts');
      const searches = meiliTargets.map(async (t) => {
        const index = meilisearch.index(t);
        const res = await index.search(q, { limit: numericLimit });
        results[t] = res.hits;
      });

      await Promise.all(searches);
      if (types.includes('lwa') && Array.isArray(results.lwa) && results.lwa.length === 0) {
        results.lwa = legacySearchLwa(q, numericLimit);
      }
      if (types.includes('posts') && !Array.isArray(results.posts)) {
        results.posts = [];
      }
      return results;
    } catch (err) {
      fastify.log.error(err);
      if (types.includes('lwa')) results.lwa = legacySearchLwa(q, numericLimit);
      if (types.includes('posts')) results.posts = [];
      if (types.includes('rituals')) results.rituals = legacySearchRituals(q, numericLimit);
      if (types.includes('recipes')) results.recipes = legacySearchRecipes(q, numericLimit);
      if (types.includes('source')) results.source = legacySearchSourceApproches(q, numericLimit);
      return results;
    }
  });
}
