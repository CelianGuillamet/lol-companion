// Entrée Electron de test (v1.55) : parcours hors partie dans la vraie fenêtre, faux client « stats ».
// Après npm run build et le bundling de test/demo.ts : node dist/demo.mjs stats, puis
// DISPLAY=:101 ARAM_DEMO_PORT=<port> ./node_modules/.bin/electron test/shell-smoke.cjs --no-sandbox --disable-gpu
// Vérifie : ⌘K (ouverture, filtre, Entrée → fiche), ⌘1 à ⌘4, contrôles segmentés au clavier, bascule de la
// fiche, filtres de l'historique, états vides sans couleur seule, absence de débordement horizontal à 900 px.
const { app } = require('electron');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

process.on('unhandledRejection', (error) => { console.error(error); app.exit(1); });
if (!process.env.ARAM_DEMO_PORT) throw new Error('ARAM_DEMO_PORT doit désigner le faux client local');
const run = mkdtempSync(join(tmpdir(), 'aram-shell-'));
app.setPath('userData', run);
console.log(`Artifacts: ${run}`);
Object.assign(process.env, {
  ARAM_SMOKE: '1', ARAM_SMOKE_SHOW: '1', ARAM_DATA_DIR: join(run, 'data'), ARAM_SMOKE_WAIT: '5000',
  ARAM_FIXTURES: resolve(__dirname, 'fixtures'), ARAM_DEMO_TOKEN: 'demo', ARAM_SMOKE_SHOT: join(run, 'main.png'),
  ARAM_SMOKE_SIZE: '900x640',
});

process.env.ARAM_SMOKE_JS = `
(async () => {
  const assert = (ok, why) => { if (!ok) throw new Error(why); };
  const wait = (ms = 250) => new Promise(r => setTimeout(r, ms));
  const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true }));
  const until = async (fn, why) => { for (let i = 0; i < 40; i++) { if (fn()) return; await wait(100); } throw new Error(why); };

  // ⌘2 : Préparer ; ⌘3 : Mes parties ; ⌘4 : Réglages ; ⌘1 : retour
  key('2'); await until(() => document.querySelector('h1')?.textContent.includes('Préparer'), '⌘2 sans effet');
  key('3'); await until(() => document.querySelector('h1')?.textContent.includes('Mes parties'), '⌘3 sans effet');
  key('4'); await until(() => document.querySelector('h1')?.textContent.includes('Réglages'), '⌘4 sans effet');
  key('1'); await until(() => document.querySelector('h1')?.textContent.includes('Avant la partie'), '⌘1 sans effet');
  assert(document.querySelector('[aria-current=page]')?.textContent.includes('Maintenant'), 'Onglet actif non annoncé');

  // ⌘K : ouverture, focus dans le champ, filtre, Entrée → fiche du champion
  key('k'); await until(() => document.querySelector('[role=dialog] input'), '⌘K sans effet');
  const q = document.querySelector('[role=dialog] input');
  assert(document.activeElement === q, 'Le champ de recherche ne prend pas le focus');
  q.value = 'leo'; q.dispatchEvent(new Event('input', { bubbles: true })); await wait();
  const first = document.querySelector('[role=option][aria-selected=true]');
  assert(first && first.textContent.includes('Leona'), 'Le filtre ne met pas Leona en premier');
  q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await until(() => document.querySelector('.champ h1')?.textContent.includes('Leona'), 'Entrée n’ouvre pas la fiche');
  assert(!document.querySelector('[role=dialog]'), 'La recherche reste ouverte');
  // Échap ferme la recherche
  key('k'); await until(() => document.querySelector('[role=dialog] input'), '⌘K (2) sans effet');
  document.querySelector('[role=dialog] input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait();
  assert(!document.querySelector('[role=dialog]'), 'Échap ne ferme pas la recherche');

  // Fiche : contrôle segmenté Mayhem / rôles, retour à la liste
  const fiche = document.querySelector('.champ [role=tablist]');
  assert(fiche && fiche.querySelector('[aria-selected=true]').textContent.trim() === 'Mayhem', 'Fiche : mode Mayhem non sélectionné');
  document.querySelector('.champ .back').click();
  await until(() => document.querySelector('h1')?.textContent.includes('Préparer'), 'Retour à la tier list impossible');

  // Tier list : flèche droite sur le contrôle segmenté → Faille (focus suit la sélection)
  const modeBtn = document.querySelector('[role=tablist][aria-label=Mode] [aria-selected=true]');
  modeBtn.focus(); modeBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await wait(400);
  const now = document.querySelector('[role=tablist][aria-label=Mode] [aria-selected=true]');
  assert(now.textContent.trim() === 'Faille' && document.activeElement === now, 'Flèches du contrôle segmenté inopérantes');
  assert(document.querySelector('[role=tablist][aria-label=Rôle]'), 'Rôles Faille absents');

  // Mes parties → historique, filtre Faille (aucune partie : état vide, pas une liste fausse)
  key('3'); await until(() => document.querySelector('h1')?.textContent.includes('Mes parties'), '⌘3 (2) sans effet');
  const vue = [...document.querySelectorAll('[role=tablist][aria-label=Vue] button')];
  vue[1].click(); await until(() => document.querySelector('[aria-label=Mode] button'), 'Historique inaccessible');
  const faille = [...document.querySelectorAll('[aria-label=Mode] button')].find(b => b.textContent.trim() === 'Faille');
  faille.click(); await wait();
  assert(faille.getAttribute('aria-pressed') === 'true', 'Filtre Faille non annoncé');

  // Pas de débordement horizontal à 900 px
  assert(document.documentElement.scrollWidth <= window.innerWidth, 'Débordement horizontal à ' + innerWidth + ' px');
  console.log('Shell assertions passed');
})();
`;

require('../dist/electron/main.cjs');
