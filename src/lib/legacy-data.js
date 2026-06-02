/* Lit data.jsx du PWA statique une seule fois au démarrage et expose les
   collections. Source de vérité unique pour le contenu éditorial. */

import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_PATHS = [
  resolve(__dirname, '../../data.jsx'),
  resolve(__dirname, '../../../data.jsx'),
];
const ENCYCLOPEDIA_PATH = resolve(__dirname, '../../../vodou_haitien_encyclopedie.txt');
const LWA_FICHES_PATH = resolve(__dirname, '../../../vodou_lwa_fiches_completes.txt');
const LWA_VEVE_RECITS_SOURCES_PATH = resolve(__dirname, '../../../lwa_veve_recits_sources.html');
const DREAMS_INTERPRETATIONS_ODT_PATH = resolve(__dirname, '../../../RÊVES — INTERPRÉTATIONS SELON LA TRADITION DU VODOU HAÏTIEN.odt');
const RITUALS_PRACTICES_DOCX_PATH = resolve(__dirname, '../../../Skills/vodou_rituels_complets.docx');
const RITUALS_ENGINE_HTML_PATH = resolve(__dirname, '../../../Skills/vodou_rituals_search_engine.html');
const RECIPES_ENGINE_HTML_PATH = resolve(__dirname, '../../../Skills/recettes_rituels_search.html');
const SOURCE_APPROCHES_PATH = resolve(__dirname, '../../../Skills/la_source_approches_philosophiques.txt');

function resolveFirstExisting(paths) {
  for (const p of paths) {
    try {
      if (existsSync(p)) return p;
    } catch {}
  }
  return null;
}

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

function decodeXmlEntities(input) {
  const s = String(input || '');
  const map = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&#34;': '"',
    '&#10;': '\n',
    '&#13;': '\r',
    '&#9;': '\t',
  };
  return s.replace(/&(?:amp|lt|gt|quot|apos);|&#(?:39|34|10|13|9);/g, (m) => map[m] ?? m);
}

function stripOdtXmlToText(xml) {
  let s = String(xml || '');
  s = s.replace(/<text:line-break\s*\/>/g, '\n');
  s = s.replace(/<text:tab\s*\/>/g, '\t');
  s = s.replace(/<text:s(?:\s+[^>]*)?\s*\/>/g, ' ');
  s = s.replace(/<\/text:p>/g, '\n');
  s = s.replace(/<\/text:h>/g, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeXmlEntities(s);
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  s = s.replace(/[ \t]+\n/g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function stripDocxXmlToText(xml) {
  let s = String(xml || '');
  s = s.replace(/<w:br\s*\/>/g, '\n');
  s = s.replace(/<w:tab\s*\/>/g, '\t');
  s = s.replace(/<\/w:p>/g, '\n');
  s = s.replace(/<w:t[^>]*>/g, '');
  s = s.replace(/<\/w:t>/g, '');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeXmlEntities(s);
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  s = s.replace(/[ \t]+\n/g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function parseDreamInterpretationsText(raw) {
  const text = String(raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').map((l) => l.replace(/[\u200B-\u200D\uFEFF]/g, '').trimEnd());

  const items = [];
  let currentSection = '';

  const isDreamHeader = (l) => /^RÊVE\s*#\d+\s+—\s+/.test(l.trim());
  const sectionMatch = (l) => l.match(/^SECTION\s+[IVXLC]+\s+—\s+(.+)$/i);

  let i = 0;
  while (i < lines.length) {
    const line = (lines[i] || '').trim();
    const sec = sectionMatch(line);
    if (sec) {
      currentSection = sec[1].trim();
      i += 1;
      continue;
    }
    if (!isDreamHeader(line)) {
      i += 1;
      continue;
    }

    const m = line.match(/^RÊVE\s*#(\d+)\s+—\s+(.+)$/);
    const title = titleCase(m?.[2] || '');
    let lwa = '';
    let tag = toId(currentSection || '') || 'reves';

    let end = i + 1;
    while (end < lines.length) {
      const l = (lines[end] || '').trim();
      if (isDreamHeader(l)) break;
      const s2 = sectionMatch(l);
      if (s2) break;
      end += 1;
    }

    const block = lines.slice(i + 1, end);
    const blockText = block.join('\n');

    const findInline = (key) => {
      const re = new RegExp(`^\\s*${key}\\s*:\\s*(.+)\\s*$`, 'im');
      const mm = blockText.match(re);
      return mm ? mm[1].trim() : '';
    };

    lwa = findInline('LWA ASSOCIÉ') || findInline('LWA ASSOCIE');
    const nanchon = findInline('NANCHON');
    if (nanchon) tag = toId(nanchon) || tag;

    const readSection = (label) => {
      const reHead = new RegExp(`^\\s*${label}\\s*:\\s*$`, 'i');
      const startIdx = block.findIndex((l) => reHead.test(String(l || '').trim()));
      if (startIdx === -1) return '';
      const buff = [];
      for (let k = startIdx + 1; k < block.length; k += 1) {
        const cur = String(block[k] || '');
        const t = cur.trim();
        if (reHead.test(t)) break;
        if (/^[A-ZÉÈÊËÎÏÔÖÙÛÜÇ0-9][A-ZÉÈÊËÎÏÔÖÙÛÜÇ0-9 ./'()-]+\\s*:\\s*$/.test(t)) break;
        buff.push(cur);
      }
      return buff.join('\n').trim();
    };

    const descVal = readSection('DESCRIPTION DU RÊVE');
    const interpVal = readSection('INTERPRÉTATION VODOU') || readSection('INTERPRETATION VODOU');
    const actionsVal = readSection('ACTIONS RITUELLES CONSEILLÉES') || readSection('ACTIONS RITUELLES CONSEILLEES') || readSection('ACTIONS RITUELLES');

    const meaningParts = [];
    if (descVal) meaningParts.push(`Description :\n${descVal}`);
    if (interpVal) meaningParts.push(`Interprétation :\n${interpVal}`);
    if (actionsVal) meaningParts.push(`Actions :\n${actionsVal}`);

    const meaning = meaningParts.join('\n\n').trim();
    if (title && meaning) items.push({ sym: title, meaning, lwa: lwa || '', tag });

    i = end;
  }

  return items;
}

function loadDreamInterpretationsFromOdt() {
  if (!existsSync(DREAMS_INTERPRETATIONS_ODT_PATH)) return [];
  try {
    const txt = execFileSync('textutil', ['-convert', 'txt', '-stdout', DREAMS_INTERPRETATIONS_ODT_PATH], { encoding: 'utf8' });
    const parsed = parseDreamInterpretationsText(txt);
    if (parsed.length) return parsed;
  } catch {}

  try {
    const xml = execFileSync('unzip', ['-p', DREAMS_INTERPRETATIONS_ODT_PATH, 'content.xml'], { encoding: 'utf8' });
    const txt = stripOdtXmlToText(xml);
    return parseDreamInterpretationsText(txt);
  } catch {
    return [];
  }
}

function parseSourceApprochesText(source) {
  const lines = String(source || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  const items = [];
  const isHeader = (l) => /^(INTRODUCTION|APPROCHE\s+\d+)\s+—\s+/.test(String(l || '').trim());

  let i = 0;
  while (i < lines.length) {
    const line = String(lines[i] || '').trim();
    if (!isHeader(line)) {
      i += 1;
      continue;
    }

    const title = line;
    const start = i + 1;
    let end = start;
    while (end < lines.length) {
      const cur = String(lines[end] || '').trim();
      if (isHeader(cur)) break;
      end += 1;
    }

    const body = lines.slice(start, end).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const id = toId(`source-${title}`) || `source-${items.length + 1}`;

    const seedKw = [
      'source', 'energie', 'énergie', 'bondye', 'vodou', 'lwa', 'ancêtres', 'ancetres',
      'kémétiste', 'kemetiste', 'kémitisme', 'kemitisme',
      'netjer', 'neter', 'neteru', 'netru', 'mawu', 'vodun', 'olodumare', 'nzambi', 'kalunga',
      'noun', 'maat', 'isfet', 'atoum', 'chou', 'tefnout', 'geb', 'nout',
      'afrique', 'africain', 'africaine', 'cosmologie', 'immanente', 'transcendant',
    ];
    const titleWords = title
      .split(/[^A-Za-zÀ-ÖØ-öø-ÿœŒ’-]+/g)
      .map((w) => w.trim())
      .filter((w) => w.length >= 4);
    const keywords = Array.from(new Set(seedKw.concat(titleWords))).filter(Boolean);

    items.push({ id, title, body, keywords });
    i = end;
  }

  return items;
}

function loadSourceApproches() {
  if (!existsSync(SOURCE_APPROCHES_PATH)) return [];
  try {
    const raw = readFileSync(SOURCE_APPROCHES_PATH, 'utf8');
    return parseSourceApprochesText(raw);
  } catch {
    return [];
  }
}

function parseRitualsSearchEngineHtml(source) {
  const html = String(source || '');
  const m = html.match(/const\s+DATA\s*=\s*(\[[\s\S]*?\n\]);/);
  if (!m) return [];

  const sandbox = { console };
  vm.createContext(sandbox);
  let raw = [];
  try {
    raw = vm.runInContext(`const DATA = ${m[1]}; DATA;`, sandbox);
  } catch {
    raw = [];
  }
  if (!Array.isArray(raw)) return [];

  const labelByCat = {
    public: 'Cérémonie',
    initiation: 'Initiation',
    funeraire: 'Funéraire',
    bain: 'Bain rituel',
    protection: 'Protection',
    divination: 'Divination',
  };

  const out = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const id = String(r.id || '').trim();
    const title = String(r.name || '').trim();
    if (!id || !title) continue;
    const cat = String(r.cat || '').trim();
    const type = labelByCat[cat] || (cat ? titleCase(cat) : '');
    const duration = String(r.duree || '').trim();
    const who = String(r.qui || '').trim();
    const lwa = String(r.lwa || '').trim();
    const urgency = Boolean(r.urgence);
    const keywords = Array.isArray(r.kw) ? r.kw.map((x) => String(x || '').trim()).filter(Boolean) : [];
    const resume = String(r.resume || '').trim();
    const steps = Array.isArray(r.etapes) ? r.etapes.map((x) => String(x || '').trim()).filter(Boolean) : [];
    const ingredients = Array.isArray(r.ingredients) ? r.ingredients.map((x) => String(x || '').trim()).filter(Boolean) : [];
    const tip = String(r.tip || '').trim() || null;
    const warn = String(r.warn || '').trim() || null;
    const sub = String(r.sub || '').trim();

    const detailsParts = [];
    if (resume) detailsParts.push(resume);
    if (steps.length) detailsParts.push(`Étapes :\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);
    if (ingredients.length) detailsParts.push(`Ingrédients :\n${ingredients.map((s) => `- ${s}`).join('\n')}`);
    const details = detailsParts.join('\n\n').trim();

    out.push({
      id,
      title,
      sub,
      cat,
      type,
      duration,
      who,
      lwa,
      urgency,
      keywords,
      resume,
      steps,
      ingredients,
      tip,
      warn,
      section: type,
      tag: cat || 'rituel',
      details,
    });
  }
  return out;
}

function parseRecipesSearchEngineHtml(source) {
  const html = String(source || '');
  const m = html.match(/const\s+RECETTES\s*=\s*(\[[\s\S]*?\n\]);/);
  if (!m) return [];

  const sandbox = { console };
  vm.createContext(sandbox);
  let raw = [];
  try {
    raw = vm.runInContext(`const RECETTES = ${m[1]}; RECETTES;`, sandbox);
  } catch {
    raw = [];
  }
  if (!Array.isArray(raw)) return [];

  const labelByCat = {
    bain: 'Bain rituel',
    wanga: 'Wanga',
    lampe: 'Lampe',
    huile: 'Huile',
    tisane: 'Tisane',
    offrande: 'Offrande',
  };

  const out = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const id = String(r.id || '').trim();
    const title = String(r.nom || r.name || '').trim();
    if (!id || !title) continue;

    const cat = String(r.cat || '').trim();
    const type = labelByCat[cat] || (cat ? titleCase(cat) : '');
    const sub = String(r.sub || '').trim();
    const duration = String(r.duree || '').trim();
    const moment = String(r.moment || '').trim();
    const urgency = Boolean(r.urg);
    const lwaList = Array.isArray(r.lwa) ? r.lwa.map((x) => String(x || '').trim()).filter(Boolean) : [];
    const lwa = lwaList.join(', ');
    const keywords = Array.isArray(r.kw) ? r.kw.map((x) => String(x || '').trim()).filter(Boolean) : [];
    const ingredients = Array.isArray(r.ingr) ? r.ingr.map((x) => String(x || '').trim()).filter(Boolean) : [];
    const steps = Array.isArray(r.etapes) ? r.etapes.map((x) => String(x || '').trim()).filter(Boolean) : [];
    const tip = String(r.tip || '').trim() || null;
    const warn = String(r.warn || '').trim() || null;

    const detailsParts = [];
    if (sub) detailsParts.push(sub);
    if (moment) detailsParts.push(`Moment : ${moment}`);
    if (steps.length) detailsParts.push(`Étapes :\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);
    if (ingredients.length) detailsParts.push(`Ingrédients :\n${ingredients.map((s) => `- ${s}`).join('\n')}`);
    const details = detailsParts.join('\n\n').trim();

    out.push({
      id,
      title,
      sub,
      cat,
      type,
      duration,
      moment,
      lwa,
      urgency,
      keywords,
      steps,
      ingredients,
      tip,
      warn,
      section: type,
      tag: cat || 'recette',
      details,
    });
  }
  return out;
}

function loadRitualsFromSearchEngineHtml() {
  if (!existsSync(RITUALS_ENGINE_HTML_PATH)) return [];
  try {
    const raw = readFileSync(RITUALS_ENGINE_HTML_PATH, 'utf8');
    return parseRitualsSearchEngineHtml(raw);
  } catch {
    return [];
  }
}

function loadRecipesFromSearchEngineHtml() {
  if (!existsSync(RECIPES_ENGINE_HTML_PATH)) return [];
  try {
    const raw = readFileSync(RECIPES_ENGINE_HTML_PATH, 'utf8');
    return parseRecipesSearchEngineHtml(raw);
  } catch {
    return [];
  }
}

function parseRitualsPracticesText(raw) {
  const text = String(raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').map((l) => l.replace(/[\u200B-\u200D\uFEFF]/g, '').trimEnd());

  const items = [];
  let currentSection = '';
  let currentSub = '';

  const sectionMatch = (l) => l.match(/^SECTION\s+[IVXLC]+\s+—\s+(.+)$/i);
  const subMatch = (l) => l.match(/^(\d+(?:\.\d+)?)\s+—\s+(.+)$/);
  const isRituelHeader = (l) => /^Rituel\s*n[°o]\s*$/i.test(String(l || '').trim()) || /^Rituel\s*n[°o]\s*:?$/i.test(String(l || '').trim());

  const nextNonEmpty = (idx) => {
    let i = idx;
    while (i < lines.length && String(lines[i] || '').trim() === '') i += 1;
    return i;
  };

  const readValueAfterKey = (block, key) => {
    const idx = block.findIndex((l) => String(l || '').trim().toLowerCase() === key.toLowerCase());
    if (idx === -1) return '';
    let i = idx + 1;
    while (i < block.length && String(block[i] || '').trim() === '') i += 1;
    const buff = [];
    while (i < block.length) {
      const t = String(block[i] || '').trim();
      if (!t) break;
      if (['nom', 'type', 'durée', 'duree', 'qui peut le faire', 'qui peut le faire ?'].includes(t.toLowerCase())) break;
      buff.push(String(block[i] || ''));
      i += 1;
    }
    return buff.join('\n').trim();
  };

  let i = 0;
  while (i < lines.length) {
    const line = String(lines[i] || '').trim();
    const sec = sectionMatch(line);
    if (sec) {
      currentSection = sec[1].trim();
      i += 1;
      continue;
    }
    const sub = subMatch(line);
    if (sub) {
      currentSub = `${sub[1]} — ${sub[2].trim()}`.trim();
      i += 1;
      continue;
    }

    if (!isRituelHeader(line)) {
      i += 1;
      continue;
    }

    i = nextNonEmpty(i + 1);
    const num = String(lines[i] || '').trim();
    const numId = toId(num) || 'x';

    let end = i + 1;
    while (end < lines.length) {
      const l = String(lines[end] || '').trim();
      if (sectionMatch(l)) break;
      if (subMatch(l)) break;
      if (isRituelHeader(l)) break;
      end += 1;
    }

    const block = lines.slice(i + 1, end);
    const name = readValueAfterKey(block, 'Nom');
    const type = readValueAfterKey(block, 'Type');
    const duration = readValueAfterKey(block, 'Durée') || readValueAfterKey(block, 'Duree');
    const who = readValueAfterKey(block, 'Qui peut le faire');

    const details = block
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const title = titleCase(name || `Rituel ${num}`);
    const sectionTag = toId(currentSection || '') || '';
    const typeTag = toId(type || '') || '';
    const tag = typeTag || sectionTag || 'rituel';

    items.push({
      id: `rituel-${numId}`,
      title,
      type: type || '',
      duration: duration || '',
      who: who || '',
      section: currentSection || '',
      subsection: currentSub || '',
      tag,
      details,
    });

    i = end;
  }

  return items;
}

function loadRitualsPracticesFromDocx() {
  if (!existsSync(RITUALS_PRACTICES_DOCX_PATH)) return [];
  try {
    const txt = execFileSync('textutil', ['-convert', 'txt', '-stdout', RITUALS_PRACTICES_DOCX_PATH], { encoding: 'utf8' });
    const parsed = parseRitualsPracticesText(txt);
    if (parsed.length) return parsed;
  } catch {}

  try {
    const xml = execFileSync('unzip', ['-p', RITUALS_PRACTICES_DOCX_PATH, 'word/document.xml'], { encoding: 'utf8' });
    const txt = stripDocxXmlToText(xml);
    return parseRitualsPracticesText(txt);
  } catch {
    return [];
  }
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
  const p = resolveFirstExisting(DATA_PATHS);
  if (!p) throw new Error('Missing data.jsx (expected at backend/data.jsx or project root data.jsx)');
  const source = readFileSync(p, 'utf8');
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

try {
  const parsed = loadDreamInterpretationsFromOdt();
  if (parsed.length) {
    const existing = Array.isArray(legacyData.DREAMS) ? legacyData.DREAMS : [];
    const seen = new Set(existing.map((d) => foldText(`${d?.sym ?? ''}`)));
    const merged = existing.slice();
    for (const d of parsed) {
      const key = foldText(d.sym);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(d);
    }
    legacyData.DREAMS = merged;
  }
} catch {}

try {
  const engine = loadRitualsFromSearchEngineHtml();
  if (engine.length) {
    legacyData.RITUALS = engine;
  } else {
    const parsed = loadRitualsPracticesFromDocx();
    if (parsed.length) {
      legacyData.RITUALS = parsed;
    } else if (!Array.isArray(legacyData.RITUALS)) {
      legacyData.RITUALS = [];
    }
  }
} catch {
  if (!Array.isArray(legacyData.RITUALS)) legacyData.RITUALS = [];
}

try {
  const parsed = loadRecipesFromSearchEngineHtml();
  if (parsed.length) {
    legacyData.RECIPES = parsed;
  } else if (!Array.isArray(legacyData.RECIPES)) {
    legacyData.RECIPES = [];
  }
} catch {
  if (!Array.isArray(legacyData.RECIPES)) legacyData.RECIPES = [];
}

try {
  const parsed = loadSourceApproches();
  legacyData.SOURCE_APPROCHES = parsed;
} catch {
  legacyData.SOURCE_APPROCHES = [];
}
