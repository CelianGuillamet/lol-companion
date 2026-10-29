// Entrée Electron de test : charge le vrai main compilé, avec faux client et données isolées.
// Après npm run build et le bundling de test/demo.ts, lancer le faux client « ingame », puis :
// DISPLAY=:101 ARAM_DEMO_PORT=<port> ./node_modules/.bin/electron test/augment-chooser-smoke.cjs --no-sandbox --disable-gpu
// Variantes : ARAM_TEST_PARTIAL=1, ARAM_TEST_COMPACT=1, ARAM_TEST_NO_CARDS=1.
const { app } = require('electron');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

process.on('unhandledRejection', (error) => { console.error(error); app.exit(1); });

if (!process.env.ARAM_DEMO_PORT) throw new Error('ARAM_DEMO_PORT doit désigner le faux client local');
const run = mkdtempSync(join(tmpdir(), 'aram-chooser-'));
app.setPath('userData', run);
Object.assign(process.env, {
  ARAM_SMOKE: '1', ARAM_SMOKE_SHOW: '1', ARAM_DATA_DIR: join(run, 'data'),
  ARAM_FIXTURES: resolve(__dirname, 'fixtures'), ARAM_DEMO_TOKEN: 'demo',
  ARAM_SMOKE_SHOT: join(run, 'main.png'),
});
const names = ['Apex Inventor', 'Firebrand', "Outlaw's Grit"];
const partial = process.env.ARAM_TEST_PARTIAL === '1';
const none = process.env.ARAM_TEST_NO_CARDS === '1';
const compact = process.env.ARAM_TEST_COMPACT === '1';
if (!none) process.env.ARAM_SMOKE_CARDS = names.slice(0, partial ? 2 : 3).join('|');
else delete process.env.ARAM_SMOKE_CARDS;

let mainSeen = false;
if (compact) app.on('browser-window-created', (_event, win) => {
  // Le titre n'est pas encore appliqué pendant browser-window-created ; main est créé en premier.
  if (mainSeen) return;
  mainSeen = true;
  win.webContents.once('did-finish-load', () => {
    // Même composant que le téléphone / second écran, sans modifier les tailles de production.
    win.setMinimumSize(320, 500);
    win.setContentSize(390, 844);
    // Un changement de hash seul conserve le composant déjà monté : recharger le document ensuite.
    void win.webContents.executeJavaScript("location.hash = '#second'; setTimeout(() => location.reload(), 0); true");
  });
});

process.env.ARAM_SMOKE_JS = `
(async () => {
  const assert = (ok, why) => { if (!ok) throw new Error(why); };
  const wait = () => new Promise(r => setTimeout(r, 100));
  const chooser = document.querySelector('.chooser');
  assert(chooser, 'Vue des augments absente');
  const cards = chooser.querySelectorAll('.offered-list li');
  assert(cards.length === ${none ? 0 : partial ? 2 : 3}, 'Nombre de cartes incorrect');
  assert(chooser.querySelectorAll('.cards .reco').length === ${none || partial ? 0 : 1}, 'Mise en avant incorrecte');
  if (${!none && !partial}) {
    assert(chooser.firstElementChild.classList.contains('cards'), 'Les filtres précèdent encore les cartes');
    assert(!chooser.querySelector('.search'), 'Les filtres masquent la réponse');
    const positions = ${JSON.stringify(Object.fromEntries(names.map((n, i) => [n, ['À gauche', 'Au milieu', 'À droite'][i]])))};
    for (const card of cards) assert(card.querySelector('.card-cue').textContent.includes(positions[card.querySelector('.n').textContent]), 'Position perdue pendant le classement');
  }
  if (${partial}) {
    assert(chooser.querySelector('[role=status]').textContent.includes('Aucun conseil'), 'Doute non expliqué');
    assert(!chooser.querySelector('.card-cue').textContent.trim(), 'Position inventée pendant une lecture partielle');
  }
  const more = chooser.querySelector('.more');
  if (more) { more.click(); await wait(); assert(more.getAttribute('aria-expanded') === 'true', 'Liste impossible à ouvrir'); }
  const search = chooser.querySelector('.search');
  assert(search, 'Recherche manuelle inaccessible');
  search.focus();
  assert(document.activeElement === search, 'Recherche inaccessible au focus');
  search.value = 'aucun-augment-avec-ce-nom'; search.dispatchEvent(new Event('input', { bubbles: true })); await wait();
  assert(chooser.textContent.includes('Aucun augment ne correspond.'), 'Recherche sans résultat incorrecte');
  search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); await wait();
  if (more && ${!partial}) { more.click(); await wait(); }
  if (${compact}) {
    assert(window.innerWidth === 390 && document.querySelector('.screen') && !document.querySelector('.shell'), 'Vue compacte incorrecte : ' + JSON.stringify({ width: innerWidth, hash: location.hash, screen: !!document.querySelector('.screen'), shell: !!document.querySelector('.shell') }));
    assert(document.documentElement.scrollWidth <= window.innerWidth, 'Débordement horizontal');
    const tabs = [...document.querySelectorAll('.tabs button')];
    assert(tabs.length === 2, 'Onglets compacts absents');
    tabs[1].click(); await wait();
    assert(tabs[1].getAttribute('aria-pressed') === 'true' && tabs[0].getAttribute('aria-pressed') === 'false', 'État accessible des onglets incorrect');
    assert(!document.querySelector('.chooser') && document.querySelector('.buy'), 'Onglet Achat incorrect');
    assert(document.querySelector('.buy .next'), 'Conseil achat absent dans son onglet');
    // Dans ce scénario, 2140 or ne financent pas l’objet à 2800 et le catalogue ne fournit pas de composants.
    assert(document.querySelectorAll('.buy .reco').length === 0, 'Un achat inaccessible ne doit pas être mis en avant');
    assert(document.querySelector('.buy .action-label').textContent === 'À économiser', 'Le manque d’or doit être explicite');
    tabs[0].click(); await wait();
    assert(document.querySelector('.chooser'), 'Retour aux augments impossible');
  } else {
    assert(!document.querySelector('.buy .reco'), 'Deux recommandations concurrentes');
  }
  console.log('Augment chooser assertions passed');
})();`;
console.log(`Artifacts: ${run}`);
require('../dist/electron/main.cjs');
