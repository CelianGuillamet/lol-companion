// Probe des API League (LCU + Live Client Data) — zéro dépendance.
// Usage : npm run probe (client League ouvert), puis joue une partie ARAM et une partie Mayhem.
// Sauvegarde les réponses JSON dans probe-output/ et signale les champs intéressants.

import https from 'node:https';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'probe-output');
mkdirSync(OUT, { recursive: true });

const LOCKFILE = '/Applications/League of Legends.app/Contents/LoL/lockfile';
const KEYWORDS = /augment|bench|perk|subteam|subset|gameMode|queue/i;
const POLL_MS = 2000;
const SWAGGER_URL = 'https://raw.githubusercontent.com/dysolix/hasagi-types/main/swagger.json';
// Liste de secours (swagger hasagi, client 16.20) si GitHub est injoignable
const FALLBACK_TB = [
  'subset-champion-list', 'pickable-champion-ids', 'current-champion', 'session', 'session/my-selection',
  'session/champion-swaps', 'session/timer', 'disabled-champion-ids', 'crowd-favorte-champion-list',
  'preferences', 'implementation-active',
].map((x) => `/lol-lobby-team-builder/champ-select/v1/${x}`);
const INGAME_EVERY_MS = 60_000;

// ---------- Découverte des identifiants LCU ----------
function findLcu() {
  try {
    const ps = execSync('ps -A -o args', { encoding: 'utf8' });
    const line = ps.split('\n').find((l) => l.includes('LeagueClientUx') && l.includes('--app-port='));
    if (line) {
      const port = line.match(/--app-port=(\d+)/)?.[1];
      const token = line.match(/--remoting-auth-token=([\w-]+)/)?.[1];
      if (port && token) return { port, token, via: 'process' };
    }
  } catch {}
  try {
    const [, , port, token] = readFileSync(LOCKFILE, 'utf8').trim().split(':');
    if (port && token) return { port, token, via: 'lockfile' };
  } catch {}
  return null;
}

// ---------- HTTP (certificats auto-signés de Riot) ----------
function get(url, auth, timeout = 4000) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      rejectUnauthorized: false,
      timeout,
      headers: auth ? { Authorization: 'Basic ' + Buffer.from(`riot:${auth}`).toString('base64') } : {},
    }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
  });
}

const lcu = (lc, path) => get(`https://127.0.0.1:${lc.port}${path}`, lc.token);
const live = (path) => get(`https://127.0.0.1:2999${path}`);

// ---------- Découverte des endpoints lol-lobby-team-builder ----------
// En ARAM, les cartes champion proposées ne sont pas dans la session champ select (cf. queuePop).
// On récupère la liste des GET 'team-builder' sans paramètre depuis le swagger communautaire hasagi.
async function discoverTeamBuilderPaths() {
  const r = await get(SWAGGER_URL, null, 30000);
  if (r.status !== 200 || !r.data?.paths) {
    console.log('  ⚠️ Swagger hasagi indisponible, liste de secours utilisée');
    return FALLBACK_TB;
  }
  const paths = Object.entries(r.data.paths)
    .filter(([p, ops]) => p.includes('team-builder') && ops.get && !p.includes('{'))
    .map(([p]) => p);
  console.log(`  🔎 ${paths.length} endpoints GET team-builder trouvés dans le swagger`);
  return paths;
}

// ---------- Sauvegarde + détection de champs ----------
let queueTag = 'unknown';
function stamp() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); }

function findKeys(obj, path = '', hits = []) {
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const p = path ? `${path}.${k}` : k;
      if (KEYWORDS.test(k)) {
        const preview = typeof v === 'object' ? JSON.stringify(v).slice(0, 120) : String(v);
        hits.push(`${p} = ${preview}`);
      }
      if (hits.length < 60) findKeys(v, p, hits);
    }
  }
  return hits;
}

function save(name, res) {
  const file = join(OUT, `${stamp()}-${queueTag}-${name}.json`);
  writeFileSync(file, JSON.stringify(res.data ?? res, null, 2));
  const hits = res.data ? [...new Set(findKeys(res.data))].slice(0, 25) : [];
  console.log(`  💾 ${name} (HTTP ${res.status}) → ${file.split('/').pop()}`);
  for (const h of hits) console.log(`     • ${h}`);
  if (!hits.length) console.log('     (aucun champ augment/bench/perk)');
}

// ---------- Boucle principale ----------
async function main() {
  console.log('ARAM Companion — probe. Ctrl+C pour arrêter.\n');
  let lc = null;
  let lastPhase = null;
  let lastIngame = 0;
  let champSelectDumps = 0;
  let helpSaved = false;
  let tbPaths = null;

  for (;;) {
    if (!lc) {
      lc = findLcu();
      if (!lc) { process.stdout.write('\r⏳ Client League introuvable, en attente…   '); await sleep(POLL_MS); continue; }
      console.log(`\n✅ LCU trouvée (port ${lc.port}, via ${lc.via})`);
      if (!helpSaved) { save('lcu-help', await lcu(lc, '/help')); helpSaved = true; }
      if (!tbPaths) tbPaths = await discoverTeamBuilderPaths();
    }

    const ph = await lcu(lc, '/lol-gameflow/v1/gameflow-phase');
    if (ph.status === 0) { lc = null; continue; }
    const phase = ph.data;

    if (phase !== lastPhase) {
      console.log(`\n▶ Phase : ${phase}`);
      if (phase === 'ChampSelect' || phase === 'Lobby' || phase === 'Matchmaking') {
        const s = await lcu(lc, '/lol-gameflow/v1/session');
        const q = s.data?.gameData?.queue;
        if (q?.id) { queueTag = `q${q.id}`; console.log(`  File : ${q.id} — ${q.description || q.gameMode || ''}`); }
      }
      if (phase === 'ChampSelect') champSelectDumps = 0;
      if (phase === 'InProgress') lastIngame = 0;
      if (phase === 'EndOfGame' || phase === 'PreEndOfGame') {
        const eog = await lcu(lc, '/lol-end-of-game/v1/eog-stats-block');
        save('eog-stats', eog);
        // C'est ce endpoint qui contient les augments Mayhem (stats.playerAugment1..6) des 10 joueurs
        // (méthode d'ARAM-Mayhem-Database / arammeta, MIT).
        if (eog.data?.gameId) {
          await sleep(3000);
          save('match-game-detail', await lcu(lc, `/lol-match-history/v1/games/${eog.data.gameId}`));
        }
        save('eog-gameclient-stats', await lcu(lc, '/lol-end-of-game/v1/gameclient-eog-stats-block'));
        await sleep(5000);
        save('match-history', await lcu(lc, '/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=0'));
      }
      lastPhase = phase;
    }

    // Champ select : 1er dump tout de suite, puis après échanges éventuels avec le banc
    if (phase === 'ChampSelect' && champSelectDumps < 3) {
      save('champselect-session', await lcu(lc, '/lol-champ-select/v1/session'));
      if (champSelectDumps === 0) {
        save('perks-current', await lcu(lc, '/lol-perks/v1/currentpage'));
        for (const p of tbPaths || []) {
          const r = await lcu(lc, p);
          if (r.status === 200 && r.data && JSON.stringify(r.data) !== '{}') {
            save('teambuilder' + p.replace(/[^a-z0-9]+/gi, '_'), r);
          }
        }
      }
      champSelectDumps++;
      await sleep(8000);
      continue;
    }

    // En jeu : allgamedata toutes les minutes (pour voir les augments arriver aux niv. 7/11/15)
    if (phase === 'InProgress' && Date.now() - lastIngame > INGAME_EVERY_MS) {
      const r = await live('/liveclientdata/allgamedata');
      if (r.status === 200) { save('ingame-allgamedata', r); lastIngame = Date.now(); }
    }

    await sleep(POLL_MS);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on('SIGINT', () => { console.log(`\n\nFichiers dans : ${OUT}`); process.exit(0); });
main();
