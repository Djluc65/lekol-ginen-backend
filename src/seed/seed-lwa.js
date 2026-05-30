/* Seed des 34 Lwa : on lit l'ancien data.jsx du PWA statique et on évalue les
   déclarations const dans un sandbox Node (data.jsx ne contient pas de JSX). */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { Lwa } from '../models/Lwa.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_PATH = resolve(__dirname, '../../../data.jsx');

function loadLegacyData() {
  const source = readFileSync(DATA_PATH, 'utf8');
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'data.jsx' });
  return sandbox.window;
}

async function main() {
  const { LWA } = loadLegacyData();
  if (!Array.isArray(LWA)) throw new Error('LWA array not found in data.jsx');

  await connectDb();
  console.log(`Seeding ${LWA.length} Lwa entries from ${DATA_PATH}…`);

  let upserted = 0;
  for (const raw of LWA) {
    const doc = {
      slug: raw.id,
      name: raw.name,
      family: raw.family,
      title: raw.title || {},
      energy: raw.energy || {},
      domain: raw.domain || {},
      elements: raw.elements || [],
      colors: raw.colors || [],
      songs: raw.songs || [],
      offerings: raw.offerings || {},
      story: raw.story || {},
      veve: raw.veve || [],
      grad: raw.grad || [],
    };
    await Lwa.updateOne({ slug: doc.slug }, { $set: doc }, { upsert: true });
    upserted++;
  }

  console.log(`✔ ${upserted} Lwa upserted.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
