import { legacyData } from '../lib/legacy-data.js';
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const IMAGE_ROOT = resolve(__dirname, '../../../Image');

function safeReaddir(path) {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function toId(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function encodePathSegment(s) {
  return encodeURIComponent(String(s || ''));
}

export default async function lwaRoutes(fastify) {
  const {
    LWA: base = [],
    LWA_FICHES_BY_ID: fichesById = {},
    LWA_FICHES: fiches = [],
    LWA_VEVE_RECITS_SOURCES_BY_ID: veveRecitsById = {},
  } = legacyData;

  const foldText = (value) => String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

  const resolveId = (id) => {
    switch (id) {
      case 'ayizan-velekete': return 'ayizan';
      case 'loko-atissou': return 'loko';
      case 'danbala-wedo':
      case 'damballa': return 'damballah';
      case 'marassa': return 'marasa';
      case 'badessy': return 'bade';
      case 'met-agwe':
      case 'agwe-agoueh':
      case 'agoueh': return 'agwe';
      case 'ezili-freda': return 'erzulie-freda';
      case 'ezili-danto': return 'erzulie-dantor';
      case 'baron-la-croix': return 'baron-la-kwa';
      case 'baron-cimetiere':
      case 'baron-simitye': return 'baron-simityè';
      case 'clairme':
      case 'clemezin': return 'klemezin';
      case 'maman-brigitte': return 'maman-brigit';
      default: return id;
    }
  };

  const pickMainImage = (names) => {
    const isImage = (n) => /\.(png|jpe?g|webp)$/i.test(String(n || ''));
    const files = (names || []).filter(isImage);
    if (!files.length) return null;
    const notVeve = files.filter((n) => !/veve|v[eè]v[eè]/i.test(n));
    const pool = notVeve.length ? notVeve : files;
    const sorted = pool.slice().sort((a, b) => {
      const ext = (s) => String(s).toLowerCase().split('.').pop();
      const w = (s) => (ext(s) === 'png' ? 0 : (ext(s) === 'jpg' || ext(s) === 'jpeg') ? 1 : 2);
      return w(a) - w(b);
    });
    return sorted[0];
  };

  const buildImageMap = () => {
    const map = {};

    const top = safeReaddir(IMAGE_ROOT);
    for (const entry of top) {
      const full = resolve(IMAGE_ROOT, entry);
      let st = null;
      try {
        st = statSync(full);
      } catch {
        st = null;
      }
      if (!st) continue;

      if (st.isDirectory()) {
        const files = safeReaddir(full);
        const main = pickMainImage(files);
        const id = resolveId(toId(entry));
        const urls = files
          .filter((n) => /\.(png|jpe?g|webp)$/i.test(String(n || '')))
          .map((n) => `/images/${encodePathSegment(entry)}/${encodePathSegment(n)}`);
        if (id && !map[id] && main) {
          map[id] = { imageUrl: `/images/${encodePathSegment(entry)}/${encodePathSegment(main)}`, imageUrls: urls };
        }
      } else if (st.isFile()) {
        if (!/\.(png|jpe?g|webp)$/i.test(entry)) continue;
        const base = entry.replace(/\.(png|jpe?g|webp)$/i, '');
        const id = resolveId(toId(base));
        if (id && !map[id]) {
          map[id] = { imageUrl: `/images/${encodePathSegment(entry)}`, imageUrls: [`/images/${encodePathSegment(entry)}`] };
        }
      }
    }

    return map;
  };

  const imageMap = buildImageMap();

  const colorMap = {
    noir: '#1a1a1a',
    blanc: '#F2F0EA',
    rouge: '#8B3A2A',
    bleu: '#4D6F8E',
    'bleu clair': '#8FB5CC',
    vert: '#7A8F3F',
    'vert foncé': '#3F5A2E',
    jaune: '#C8A24A',
    or: '#C8A24A',
    argent: '#B7C0C8',
    violet: '#3b1f4a',
    rose: '#E8C8D5',
    turquoise: '#46b5c6',
    brun: '#7A5A2E',
  };

  const pickColors = (colorsText) => {
    const needle = String(colorsText || '').toLowerCase();
    const hits = [];
    for (const [k, v] of Object.entries(colorMap)) {
      if (needle.includes(k)) hits.push(v);
    }
    const uniq = Array.from(new Set(hits));
    if (uniq.length >= 3) return uniq.slice(0, 3);
    if (uniq.length === 2) return [uniq[0], uniq[1], '#C8A24A'];
    if (uniq.length === 1) return [uniq[0], '#C8A24A', '#0b1b2b'];
    return ['#F2F0EA', '#C8A24A', '#0b1b2b'];
  };

  const pickVeve = ({ id, family, colors, hay }) => {
    const map = {
      kalfou: ["cross-tall","ring-c","dot-c","line-d1","line-d2","dot-tl","dot-br"],
      'bosou-trois-cornes': ["diamond-c","cross-tall","dot-c","line-h","dot-tl","dot-tr","dot-bl","dot-br"],
      agaou: ["star-c","cross-small","dot-c","line-h2","dot-tl","dot-br"],
      agassou: ["diamond-c","star-c","ring-c","dot-c","dot-tl","dot-tr"],
      'kongo-zandor': ["square","ring-c","wave","dot-c","line-d1","dot-bl"],
      makaya: ["star-c","ring-c","dot-c","line-d1","line-d2","dot-tr"],
      'papa-gede': ["skull-ish","cross-tall","ring-c","dot-c","line-h","dot-tl"],
      'ti-bon-ange': ["ring-c","dot-c","arc-top","arc-bot","cross-small","dot-tl","dot-br"],
      ibo: ["two-rings","ring-c","dot-c","line-d1","dot-tr","dot-bl"],
      lemba: ["diamond-c","ring-c","arc-top","arc-bot","dot-c","cross-small"],
      'erzulie-je-wouj': ["heart-like","ring-c","dot-tl","dot-tr","cross-small","line-d1","line-d2"],
    };
    if (id && map[id]) return map[id];

    const f = foldText(family);
    const h = foldText(hay);
    const out = [];

    if (f.includes('gede') || h.includes('cimetiere') || h.includes('mort') || h.includes('tombe')) {
      out.push("cross-tall","skull-ish","ring-c","dot-c");
    } else if (f.includes('petro') || h.includes('petro') || h.includes('feu') || h.includes('piment') || h.includes('brul')) {
      out.push("sword-v","cross-small","ring-c","dot-c");
    } else if (h.includes('mer') || h.includes('ocean') || h.includes('marin') || h.includes('bateau')) {
      out.push("ship-like","wave","wave2","ring-c","dot-c");
    } else if (h.includes('eau') || h.includes('riviere') || h.includes('source') || h.includes('etang') || h.includes('arc-en-ciel')) {
      out.push("wave","wave2","ring-c","dot-c");
    } else if (h.includes('carrefour') || h.includes('porte') || h.includes('cle') || h.includes('chemin') || h.includes('route')) {
      out.push("cross-tall","ring-c","dot-c","line-d1");
    } else if (h.includes('agriculture') || h.includes('champ') || h.includes('terre') || h.includes('recolte')) {
      out.push("square","diamond-c","dot-c","line-h");
    } else if (h.includes('tonnerre') || h.includes('eclair') || h.includes('orage')) {
      out.push("star-c","cross-small","dot-c","line-h2");
    } else if (h.includes('royal') || h.includes('royaume') || h.includes('couronne')) {
      out.push("diamond-c","star-c","ring-c","dot-c");
    } else if (h.includes('amour') || h.includes('beau') || h.includes('lux') || h.includes('coeur')) {
      out.push("heart-like","ring-c","dot-c","cross-small");
    } else if (h.includes('fer') || h.includes('machette') || h.includes('epee') || h.includes('guerre')) {
      out.push("sword-v","cross-tall","dot-c","line-h");
    } else if (h.includes('foret') || h.includes('arbre') || h.includes('bois')) {
      out.push("diamond-c","arc-top","arc-bot","ring-c","dot-c");
    } else {
      out.push("ring-c","cross-small","dot-tl","dot-tr","dot-bl","dot-br");
    }

    if (Array.isArray(colors) && colors[1]) {
      if (!out.includes('dot-tl')) out.push('dot-tl');
      if (!out.includes('dot-br')) out.push('dot-br');
    }

    return out.slice(0, 10);
  };

  const normalizeBase = (l) => ({
    ...l,
    id: l.id || l.slug,
    slug: l.slug || l.id,
    title: l.title || { fr: '' },
    story: l.story || { fr: '' },
    domain: l.domain || { fr: '' },
    energy: l.energy || { fr: '' },
    elements: Array.isArray(l.elements) ? l.elements : [],
    colors: Array.isArray(l.colors) ? l.colors : ['#F2F0EA', '#C8A24A', '#0b1b2b'],
    songs: Array.isArray(l.songs) ? l.songs : [],
    offerings: l.offerings || { fr: '' },
    veve: Array.isArray(l.veve) ? l.veve : ["ring-c","cross-tall","dot-tl","dot-tr","dot-bl","dot-br"],
    grad: Array.isArray(l.grad) ? l.grad : ['#0b1b2b', '#0b1b2b'],
  });

  const mergeFiche = (lwa) => {
    const id = lwa.id || lwa.slug;
    const fiche = (id && fichesById[id]) ? fichesById[id] : null;
    let out = { ...lwa };

    if (fiche) {
      const mergedColors = out.colors?.length ? out.colors : pickColors(fiche.colorsText);
      const mergedGrad = out.grad?.length ? out.grad : [mergedColors[0] || '#0b1b2b', '#0b1b2b'];
      const mergedVeve = (Array.isArray(out.veve) && out.veve.length)
        ? out.veve
        : pickVeve({
          id,
          family: fiche.nanchon || out.family,
          colors: mergedColors,
          hay: `${fiche.domain || ''} ${fiche.magic || ''} ${(fiche.symbols || []).join(' ')} ${fiche.catholicSaint || ''}`,
        });
      const mergedElements = (Array.isArray(out.elements) && out.elements.length) ? out.elements : [];
      const elements = (() => {
        if (mergedElements.length) return mergedElements;
        const hay = foldText(`${fiche.domain || ''} ${fiche.magic || ''} ${(fiche.symbols || []).join(' ')}`);
        const out = [];
        if (hay.includes('mer') || hay.includes('ocean') || hay.includes('poisson')) out.push('mer', 'eau');
        if (hay.includes('eau') || hay.includes('riviere') || hay.includes('source') || hay.includes('etang')) out.push('eau');
        if (hay.includes('feu') || hay.includes('brul') || hay.includes('piment')) out.push('feu');
        if (hay.includes('fer') || hay.includes('machette') || hay.includes('epee') || hay.includes('chaine')) out.push('fer');
        if (hay.includes('tonnerre') || hay.includes('eclair') || hay.includes('orage')) out.push('ciel', 'feu');
        if (hay.includes('foret') || hay.includes('arbre') || hay.includes('bois')) out.push('bois');
        if (hay.includes('carrefour') || hay.includes('porte') || hay.includes('chemin') || hay.includes('route')) out.push('route');
        if (hay.includes('mort') || hay.includes('cimetiere') || hay.includes('tombe')) out.push('os', 'terre');
        if (hay.includes('terre') || hay.includes('agriculture') || hay.includes('champ')) out.push('terre');
        return Array.from(new Set(out));
      })();

      out = {
        ...out,
        colors: mergedColors,
        grad: mergedGrad,
        veve: mergedVeve,
        elements: elements.length ? elements : mergedElements,
        gender: out.gender || fiche.gender,
        day: out.day || fiche.day,
        foods: out.foods || fiche.foods,
        drinks: out.drinks || fiche.drinks,
        animals: out.animals || fiche.animals,
        plants: out.plants || fiche.plants,
        trees: out.trees || fiche.trees,
        perfume: out.perfume || fiche.perfume,
        ritualObjects: out.ritualObjects || fiche.ritualObjects,
        magic: out.magic || fiche.magic,
        catholicSaint: out.catholicSaint || fiche.catholicSaint,
        symbols: out.symbols || fiche.symbols,
        altNames: out.altNames || fiche.altNames,
        prayer: out.prayer || fiche.prayer,
        note: out.note || fiche.note,
        personality: out.personality || fiche.personality,
        titles: out.titles || fiche.titles,
        variants: out.variants || fiche.variants,
        spouses: out.spouses || fiche.spouses,
        sources: out.sources || ['vodou_lwa_fiches_completes.txt'],
      };
    }

    const rec = (id && veveRecitsById[id]) ? veveRecitsById[id] : null;
    if (rec) {
      out = {
        ...out,
        family: rec.nat || out.family,
        colors: Array.isArray(rec.colors) && rec.colors.length ? rec.colors : out.colors,
        story: { ...(out.story || {}), fr: rec.recit || out.story?.fr || '' },
        veveText: rec.veveText || out.veveText,
        sources: Array.isArray(rec.sources) && rec.sources.length ? rec.sources : out.sources,
      };
    }

    return out;
  };

  const createFromFiche = (fiche, idOverride) => {
    const colors = pickColors(fiche.colorsText);
    const offerings = [
      fiche.foods?.length ? `Nourriture: ${fiche.foods.join(', ')}` : '',
      fiche.drinks?.length ? `Boisson: ${fiche.drinks.join(', ')}` : '',
    ].filter(Boolean).join('\n');
    const story = [
      fiche.domain ? fiche.domain : '',
      fiche.magic ? fiche.magic : '',
      fiche.note ? fiche.note : '',
    ].filter(Boolean).join('\n\n');
    const id = idOverride || fiche.id;
    return mergeFiche(normalizeBase({
      id,
      slug: id,
      name: fiche.name,
      family: (fiche.nanchon || '').split('/')[0].trim() || 'Rada',
      title: { fr: fiche.domain ? fiche.domain.split(',')[0].trim() : '' },
      energy: { fr: '—' },
      domain: { fr: fiche.domain || '' },
      elements: [],
      colors,
      songs: [],
      offerings: { fr: offerings || '—' },
      story: { fr: story || '—' },
      veve: pickVeve({
        id,
        family: fiche.nanchon,
        colors,
        hay: `${fiche.domain || ''} ${fiche.magic || ''} ${(fiche.symbols || []).join(' ')} ${fiche.catholicSaint || ''}`,
      }),
      grad: [colors[0] || '#0b1b2b', '#0b1b2b'],
    }));
  };

  const all = (() => {
    const items = base.map(normalizeBase).map(mergeFiche);
    const have = new Set(items.map((l) => l.id));
    for (const f of fiches) {
      if (f.isGroup) continue;
      const id = resolveId(f.id);
      if (!have.has(id)) items.push(createFromFiche(f, id));
    }
    for (const l of items) {
      const id = resolveId(l.id || l.slug || '');
      const img = (id && imageMap[id]) ? imageMap[id] : null;
      if (img?.imageUrl && !l.imageUrl) l.imageUrl = img.imageUrl;
      if (Array.isArray(img?.imageUrls) && img.imageUrls.length && !l.imageUrls) l.imageUrls = img.imageUrls;
    }
    return items;
  })();

  fastify.get('/', async (req) => {
    const { family, q, limit = 100 } = req.query || {};
    const needle = String(q || '').trim().toLowerCase();
    const nLimit = Math.min(Number(limit) || 100, 500);
    const items = all
      .filter((l) => {
        if (family && String(l.family).toLowerCase() !== String(family).toLowerCase()) return false;
        if (!needle) return true;
        const hay = `${l.id} ${l.name} ${l.family} ${l.title?.fr ?? ''} ${l.domain?.fr ?? ''} ${l.story?.fr ?? ''} ${(l.altNames || []).join(' ')} ${(l.symbols || []).join(' ')}`.toLowerCase();
        return hay.includes(needle);
      })
      .slice(0, nLimit);
    return { count: items.length, items };
  });

  fastify.get('/:slug', async (req, reply) => {
    const slug = String(req.params.slug || '').trim();
    const item = all.find((l) => l.id === slug || l.slug === slug);
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return item;
  });

  fastify.get('/families/list', async () => {
    const families = Array.from(new Set(all.map((l) => l.family))).sort();
    return { families };
  });
}
