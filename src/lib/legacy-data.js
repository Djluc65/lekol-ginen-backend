/* Lit data.jsx du PWA statique une seule fois au démarrage et expose les
   collections. Source de vérité unique pour le contenu éditorial. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_PATH = resolve(__dirname, '../../../data.jsx');
const ENCYCLOPEDIA_PATH = resolve(__dirname, '../../../vodou_haitien_encyclopedie.txt');
const LWA_FICHES_PATH = resolve(__dirname, '../../../vodou_lwa_fiches_completes.txt');
const LWA_VEVE_RECITS_SOURCES_PATH = resolve(__dirname, '../../../lwa_veve_recits_sources.html');

function foldText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function toId(value) {
  return foldText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function resolveLwaId(id) {
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
}

function parseEncyclopedia(source) {
  const lines = String(source || '').split(/\r?\n/);
  const concepts = [];

  const cleanLine = (s) => String(s || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  const isSeparator = (s) => /^-{10,}$/.test(cleanLine(s).replace(/\s+/g, ''));
  const isHeading = (s) => {
    const t = cleanLine(s);
    return (
      t.startsWith('DÉFINITION') ||
      t.startsWith('APPROCHES & FORMULATIONS') ||
      t.startsWith('ÉTAPES & FORMULATIONS') ||
      t.startsWith('FORMULES & EXPRESSIONS') ||
      t.startsWith('CITATION')
    );
  };

  let i = 0;
  while (i < lines.length) {
    const line = cleanLine(lines[i]);
    const isSep = isSeparator(line);
    const next = cleanLine(lines[i + 1]);
    const titleMatch = next.match(/^(\d+)\.\s+(.+)$/);
    if (!isSep || !titleMatch) {
      i += 1;
      continue;
    }

    const term = titleMatch[2].trim();
    i += 2;

    let category = '';
    let subtitle = '';

    while (i < lines.length) {
      const l = cleanLine(lines[i]);
      if (l.startsWith('DÉFINITION')) break;
      if (l.startsWith('Catégorie :')) category = l.replace('Catégorie :', '').trim();
      if (l.startsWith('Sous-titre :')) subtitle = l.replace('Sous-titre :', '').trim();
      i += 1;
    }

    const readSection = (prefix) => {
      while (i < lines.length && cleanLine(lines[i]) === '') i += 1;
      const l = cleanLine(lines[i]);
      if (!l.startsWith(prefix)) return '';
      i += 1;
      const buff = [];
      while (i < lines.length) {
        const cur = lines[i] ?? '';
        const t = cleanLine(cur);
        if (isHeading(t)) break;
        if (isSeparator(t)) break;
        buff.push(cur);
        i += 1;
      }
      return buff.join('\n').trim();
    };

    const definitionParts = [];
    while (true) {
      const part = readSection('DÉFINITION');
      if (!part) break;
      definitionParts.push(part);
    }
    const definition = definitionParts.join('\n\n').trim();

    const approachesRaw = readSection('APPROCHES & FORMULATIONS');
    const stepsRaw = readSection('ÉTAPES & FORMULATIONS');
    const formulasRaw = readSection('FORMULES & EXPRESSIONS :');
    const citationRaw = readSection('CITATION');

    const toList = (raw) => {
      const out = [];
      for (const l of String(raw || '').split(/\r?\n/)) {
        const t = l.trim();
        if (!t) continue;
        if (t.startsWith('-')) out.push(t.replace(/^-+\s*/, '').trim());
        else out.push(t);
      }
      return out;
    };

    const approaches = toList([approachesRaw, stepsRaw].filter(Boolean).join('\n'));
    const formulas = toList(formulasRaw);

    let citation = '';
    let citationSource = '';
    const citationLines = String(citationRaw || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const cl of citationLines) {
      if (cl.startsWith('—')) {
        citationSource = cl.replace(/^—\s*/, '').trim();
      } else if (!citation) {
        citation = cl;
      } else {
        citation += ` ${cl}`;
      }
    }

    concepts.push({
      id: toId(term),
      term,
      category,
      subtitle,
      definition,
      approaches,
      formulas,
      citation,
      citationSource,
    });
  }

  return concepts;
}

function titleCase(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const hasLower = /[a-zàâäçéèêëîïôöùûüÿœ]/.test(s);
  if (hasLower) return s;
  return s
    .toLowerCase()
    .replace(/\b([a-zàâäçéèêëîïôöùûüÿœ])/g, (m) => m.toUpperCase());
}

function parseLwaFiches(source) {
  const lines = String(source || '').split(/\r?\n/);
  const cleanLine = (s) => String(s || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  const isSeparator = (s) => /^-{10,}$/.test(cleanLine(s).replace(/\s+/g, ''));
  const isStart = (s) => cleanLine(s).startsWith('LWA #');

  const fiches = [];
  let i = 0;

  const parseList = (raw) => {
    const parts = String(raw || '')
      .split(/\r?\n/)
      .flatMap((l) => l.split(','))
      .map((p) => p.trim())
      .filter(Boolean);
    return parts;
  };

  const stripParens = (s) => String(s || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();

  while (i < lines.length) {
    const line = cleanLine(lines[i]);
    if (!isStart(line)) {
      i += 1;
      continue;
    }

    const parts = line.split('—').map((p) => p.trim());
    const namePart = parts.slice(1).join('—').trim();
    const headingHasFamily = /\bfamille\b/i.test(namePart);
    const headingHasOtherGroup = /\bautres\b/i.test(namePart);
    const parenNames = [];
    const parenMatches = String(namePart || '').matchAll(/\(([^)]*)\)/g);
    for (const m of parenMatches) {
      for (const p of String(m[1] || '').split('/')) {
        for (const t of p.split(',')) {
          const v = t.trim();
          if (v) parenNames.push(v);
        }
      }
    }

    const namePartNoParens = stripParens(namePart).replace(/[()]/g, '').trim();
    const nameVariants = namePartNoParens ? namePartNoParens.split('/').map((p) => p.trim()).filter(Boolean) : [];
    const primaryRaw = nameVariants[0] || namePartNoParens || line;

    let id = toId(primaryRaw);
    if (id === 'kongo' && nameVariants.length > 1) id = toId(nameVariants[1]);

    const kv = {};
    let currentKey = '';
    let currentVal = '';

    const flush = () => {
      if (!currentKey) return;
      kv[currentKey] = (kv[currentKey] ? `${kv[currentKey]}\n${currentVal}` : currentVal).trim();
      currentKey = '';
      currentVal = '';
    };

    i += 1;
    while (i < lines.length) {
      const l = cleanLine(lines[i]);
      if (isStart(l)) break;
      if (isSeparator(l)) {
        flush();
        i += 1;
        continue;
      }

      const m = l.match(/^([A-ZÉÈÊËÎÏÔÖÙÛÜÇ0-9 ./'()-]+?)\s*:\s*(.*)$/);
      if (m) {
        flush();
        currentKey = m[1].trim();
        currentVal = m[2].trim();
        i += 1;
        continue;
      }

      if (currentKey) {
        currentVal = `${currentVal}\n${l}`.trim();
      }
      i += 1;
    }
    flush();

    const altNamesFromBlock = parseList(kv['NOMS ALTERNATIFS'] || '');
    const symbols = parseList(kv['SYMBOLE'] || '');
    const titles = parseList(kv['TITRES'] || '');
    const variants = parseList(kv['VARIANTES'] || '');
    const spouses = parseList(kv['ÉPOUSES'] || kv['ÉPOUX'] || '');

    fiches.push({
      id,
      name: titleCase(primaryRaw),
      nanchon: (kv['NANCHON'] || '').trim(),
      gender: (kv['GENRE'] || '').trim(),
      domain: (kv['DOMAINE'] || '').trim(),
      day: (kv['JOUR'] || '').trim(),
      colorsText: (kv['COULEURS'] || '').trim(),
      foods: parseList(kv['NOURRITURE'] || ''),
      drinks: parseList(kv['BOISSON'] || ''),
      animals: parseList(kv['ANIMAL'] || ''),
      plants: parseList(kv['PLANTES'] || ''),
      trees: parseList(kv['ARBRE'] || kv['ARBRES'] || ''),
      perfume: parseList(kv['PARFUM'] || ''),
      ritualObjects: parseList(kv['OBJETS RITUELS'] || ''),
      magic: (kv['MAGIE/RITUEL'] || '').trim(),
      catholicSaint: (kv['SAINT CATHOLIQUE'] || '').trim(),
      symbols,
      titles,
      prayer: (kv['PRIÈRE/FORMULE'] || '').trim(),
      altNames: Array.from(new Set([...nameVariants.slice(1), ...parenNames, ...altNamesFromBlock])).filter(Boolean).map(titleCase),
      note: (kv['NOTE'] || kv['NOTE IMPORTANTE'] || '').trim(),
      personality: (kv['PERSONNALITÉ'] || '').trim(),
      variants,
      spouses,
      isGroup: headingHasFamily || headingHasOtherGroup,
    });
  }

  const byId = {};
  for (const f of fiches) {
    const resolved = resolveLwaId(f.id);
    byId[resolved] = f;
    if (f.altNames?.length) {
      for (const n of f.altNames) {
        const a = resolveLwaId(toId(n));
        if (a && !byId[a]) byId[a] = f;
      }
    }
  }

  return { fiches, byId };
}

function parseLwaVeveRecitsSourcesHtml(source) {
  const html = String(source || '');
  const m = html.match(/const\s+DATA\s*=\s*(\[[\s\S]*?\n\]);/);
  if (!m) return { items: [], byId: {} };

  const sandbox = { console };
  vm.createContext(sandbox);
  let raw = [];
  try {
    raw = vm.runInContext(`const DATA = ${m[1]}; DATA;`, sandbox);
  } catch {
    raw = [];
  }

  const items = Array.isArray(raw) ? raw.map((x) => ({
    id: resolveLwaId(toId(x?.name || '')),
    name: String(x?.name || '').trim(),
    nat: String(x?.nat || '').trim(),
    colors: Array.isArray(x?.col) ? x.col : [],
    veveText: String(x?.veve || '').trim(),
    recit: String(x?.recit || '').trim(),
    sources: Array.isArray(x?.sources) ? x.sources : [],
  })).filter((x) => x.id) : [];

  const byId = {};
  for (const it of items) byId[it.id] = it;
  return { items, byId };
}

function load() {
  const source = readFileSync(DATA_PATH, 'utf8');
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'data.jsx' });
  return sandbox.window;
}

export const legacyData = load();
try {
  const raw = readFileSync(ENCYCLOPEDIA_PATH, 'utf8');
  legacyData.ENCYCLOPEDIA = parseEncyclopedia(raw);
} catch {
  legacyData.ENCYCLOPEDIA = [];
}

try {
  const raw = readFileSync(LWA_FICHES_PATH, 'utf8');
  const parsed = parseLwaFiches(raw);
  legacyData.LWA_FICHES = parsed.fiches;
  legacyData.LWA_FICHES_BY_ID = parsed.byId;
} catch {
  legacyData.LWA_FICHES = [];
  legacyData.LWA_FICHES_BY_ID = {};
}

try {
  const raw = readFileSync(LWA_VEVE_RECITS_SOURCES_PATH, 'utf8');
  const parsed = parseLwaVeveRecitsSourcesHtml(raw);
  legacyData.LWA_VEVE_RECITS_SOURCES = parsed.items;
  legacyData.LWA_VEVE_RECITS_SOURCES_BY_ID = parsed.byId;
} catch {
  legacyData.LWA_VEVE_RECITS_SOURCES = [];
  legacyData.LWA_VEVE_RECITS_SOURCES_BY_ID = {};
}
