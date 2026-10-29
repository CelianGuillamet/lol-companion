// Stats ARAM: Mayhem d'un champion, depuis les JSON publics d'arammeta.com
// (projet Lanternko/ARAM-Mayhem-Database, licence MIT : données agrégées collectées via la LCU).
//
// Usage :
//   npm run mayhem -- Yasuo          (ou un id : npm run mayhem -- 157)
//   npm run mayhem -- Yasuo --file /chemin/vers/docs/api   (hors ligne, copie locale du dépôt)
//
// Cache : data/cache/arammeta/ (re-téléchargé si plus vieux que 12 h).

import https from 'node:https';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://arammeta.com/api';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'data', 'cache', 'arammeta');
const MAX_AGE_MS = 12 * 3600 * 1000;
const TOP_N = 5;
const RARITIES = [['kPrismatic', 'Prismatic'], ['kGold', 'Gold'], ['kSilver', 'Silver']];

const args = process.argv.slice(2);
const fileIdx = args.indexOf('--file');
const localDir = fileIdx >= 0 ? args[fileIdx + 1] : null;
const query = args.filter((a, i) => fileIdx < 0 || (i !== fileIdx && i !== fileIdx + 1)).join(' ').trim();

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 30000, headers: { 'User-Agent': 'aram-companion (perso)' } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} sur ${url}`)); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(body));
    }).on('error', reject).on('timeout', function () { this.destroy(new Error(`timeout sur ${url}`)); });
  });
}

async function load(rel) {
  if (localDir) return JSON.parse(readFileSync(join(localDir, rel), 'utf8'));
  const file = join(CACHE, rel.replace(/\//g, '_'));
  if (existsSync(file) && Date.now() - statSync(file).mtimeMs < MAX_AGE_MS) {
    return JSON.parse(readFileSync(file, 'utf8'));
  }
  const body = await download(`${BASE}/${rel}`);
  const data = JSON.parse(body);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, body);
  return data;
}

const pct = (x) => (x == null ? '  -  ' : `${(x * 100).toFixed(1)}%`);
const signed = (x) => (x == null ? '' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)} pts`);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function findChampion(champs, q) {
  if (/^\d+$/.test(q) && champs[q]) return [q, champs[q]];
  const n = norm(q);
  return Object.entries(champs).find(([, c]) => norm(c.name_en) === n || norm(c.alias) === n)
    || Object.entries(champs).find(([, c]) => norm(c.name_en).startsWith(n) || norm(c.alias).startsWith(n));
}

async function main() {
  if (!query) {
    console.log('Usage : npm run mayhem -- <champion>   (ex. npm run mayhem -- Yasuo)');
    process.exit(1);
  }
  const tier = await load('tier-list.json');
  const found = findChampion(tier.champs, query);
  if (!found) {
    console.log(`Champion introuvable : « ${query} »`);
    process.exit(1);
  }
  const [id, champ] = found;
  const detail = await load(`${tier.detailBase?.replace(/^api\//, '') || 'champions'}/${id}.json`);
  const augName = (aid) => tier.augs?.[aid]?.name_en || `#${aid}`;

  console.log(`\n${champ.name_en} — ARAM: Mayhem, patch ${tier.patch_prefix} (arammeta)`);
  console.log(`Winrate ${pct(champ.wr)} sur ${champ.g?.toLocaleString('fr-FR')} parties\n`);

  for (const [key, label] of RARITIES) {
    const rows = (detail.top?.[key] || []).slice(0, TOP_N);
    if (!rows.length) continue;
    console.log(`  ${label}`);
    for (const r of rows) {
      console.log(`    ${augName(r.id).padEnd(28)} ${pct(r.wr).padStart(6)}  ${signed(r.lift).padStart(10)}  (${r.g} parties)`);
    }
    const worst = (detail.bot?.[key] || []).slice(0, 2);
    if (worst.length) console.log(`    à éviter : ${worst.map((r) => `${augName(r.id)} (${pct(r.wr)})`).join(', ')}`);
    console.log('');
  }

  const show = (title, list, n = 3) => {
    const rows = (list || []).slice(0, n);
    if (!rows.length) return;
    console.log(`  ${title}`);
    for (const r of rows) console.log(`    ${String(r.name_en).padEnd(40)} ${pct(r.wr).padStart(6)}  (${r.g} parties)`);
    console.log('');
  };
  show('Items (paires)', detail.items?.top);
  show('Bottes', detail.boots?.top, 2);
  show('Sorts', detail.spells?.top, 2);

  console.log('Source : arammeta.com (MIT). Statistiques historiques, pas une garantie de résultat.');
}

main().catch((e) => {
  console.error(`Erreur : ${e.message}`);
  if (!localDir) console.error('Si arammeta.com est injoignable, relance avec --file <copie locale de docs/api>.');
  process.exit(1);
});
