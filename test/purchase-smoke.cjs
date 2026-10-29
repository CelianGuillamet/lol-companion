// Vrai main Electron + faux client « purchase » (recette synthétique), profil et données isolés.
// ARAM_DEMO_PORT=<port> DISPLAY=:102 electron test/purchase-smoke.cjs --no-sandbox --disable-gpu
// ARAM_TEST_PURCHASE=component|saving|item ; ARAM_TEST_COMPACT=1 ; ARAM_TEST_MINIMAL=1.
const { app, BrowserWindow } = require('electron');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

if (!process.env.ARAM_DEMO_PORT) throw new Error('Lancer test/demo.ts purchase et fournir ARAM_DEMO_PORT');
process.on('unhandledRejection', (error) => { console.error(error); app.exit(1); });
const run = mkdtempSync(join(tmpdir(), 'aram-purchase-'));
const mode = process.env.ARAM_TEST_PURCHASE ?? 'component';
if (!['component', 'saving', 'item'].includes(mode)) throw new Error('ARAM_TEST_PURCHASE invalide');
const compact = process.env.ARAM_TEST_COMPACT === '1';
const minimal = process.env.ARAM_TEST_MINIMAL === '1';
const itemName = mode === 'component' ? 'Composant amélioré (test)' : 'Objet final (test)';
const cost = mode === 'component' ? 600 : 2400;
app.setPath('userData', run);
Object.assign(process.env, {
  ARAM_SMOKE: '1', ARAM_SMOKE_SHOW: '1', ARAM_DATA_DIR: join(run, 'data'),
  ARAM_FIXTURES: resolve(__dirname, 'fixtures'), ARAM_DEMO_TOKEN: 'demo',
  ARAM_SMOKE_SHOT: join(run, 'main.png'),
});
delete process.env.ARAM_SMOKE_CARDS;

const overlayAssertions = `(() => {
  const assert = (ok, why) => { if (!ok) throw new Error(why); };
  const root = document.querySelector(${JSON.stringify(minimal ? '.ov.mini' : '.purchase')});
  assert(root, 'Vue achat overlay absente');
  assert(root.querySelector('.name').textContent.includes(${JSON.stringify(itemName)}), 'Overlay ne montre pas le bon achat');
  if (${minimal}) assert(root.querySelector('.name').textContent.startsWith(${JSON.stringify(mode === 'saving' ? 'Économise' : 'Achète')}), 'Directive minimale incorrecte');
  else assert(root.querySelector('.label').textContent.includes(${JSON.stringify(mode === 'saving' ? 'économiser' : 'Acheter')}), 'État achat overlay incorrect');
  assert(!!root.querySelector('.good') === ${mode !== 'saving'}, 'Objet non achetable marqué comme disponible');
  if (${mode === 'component'}) assert(root.textContent.includes('600'), 'Prix du composant ignoré par overlay');
  return 'overlay purchase assertions passed';
})();`;

process.env.ARAM_SMOKE_JS = `(async () => {
  const assert = (ok, why) => { if (!ok) throw new Error(why); };
  const wait = () => new Promise(r => setTimeout(r, 200));
  const state = await window.api.getState();
  const row = state.nextBuy?.rows[0];
  assert(row?.item.id === 2502 && row.remaining === 2400, 'Recette synthétique inattendue');
  if (${mode === 'component'}) assert(row.step?.price === 600 && row.step.item.id === 1057, 'Upgrade ignorée par le moteur');
  else assert(!row.step, 'Composant proposé hors budget ou après financement complet');
  if (${compact}) {
    assert(innerWidth === 390 && document.querySelector('.screen'), 'Vue second écran compacte absente');
    const tabs = [...document.querySelectorAll('.tabs button')];
    tabs.find(b => b.textContent === 'Achat').click(); await wait();
  }
  const hero = document.querySelector('.buy .next');
  assert(hero, 'Conseil achat absent');
  assert(hero.querySelector('.name').textContent === ${JSON.stringify(itemName)}, 'L’objet final masque le composant achetable');
  assert(hero.querySelector('.price').textContent.replace(/\\s/g, '').includes('${cost}or'), 'Montant à payer incorrect');
  assert(hero.textContent.includes(${JSON.stringify(mode === 'saving' ? 'À économiser' : 'Acheter maintenant')}), 'Action achat trompeuse');
  assert(!!hero.querySelector('.good') === ${mode !== 'saving'}, 'Affordabilité incorrecte');
  if (${mode === 'component'}) assert(hero.querySelector('.goal').textContent.includes('Objet final (test)'), 'Objectif final perdu');
  if (${compact}) assert(document.documentElement.scrollWidth <= innerWidth, 'Débordement horizontal');
  await window.api.setSettings({ overlayDensity: ${JSON.stringify(minimal ? 'minimal' : 'compact')} });
  await wait();
})();`;

let mainSeen = false;
app.on('browser-window-created', (_event, win) => {
  if (mainSeen) return;
  mainSeen = true;
  if (compact) win.webContents.once('did-finish-load', () => {
    win.setMinimumSize(320, 500);
    win.setContentSize(390, 844);
    void win.webContents.executeJavaScript("location.hash = '#second'; setTimeout(() => location.reload(), 0); true");
  });
  // Attendre aussi les assertions sur la vraie fenêtre overlay avant que le smoke intégré capture et quitte.
  const execute = win.webContents.executeJavaScript.bind(win.webContents);
  win.webContents.executeJavaScript = async (code, ...args) => {
    const result = await execute(code, ...args);
    if (code === process.env.ARAM_SMOKE_JS) {
      const overlay = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('overlay.html'));
      if (!overlay) throw new Error('Fenêtre overlay absente');
      console.log(await overlay.webContents.executeJavaScript(overlayAssertions));
    }
    return result;
  };
});
console.log(`Artifacts: ${run}`);
require('../dist/electron/main.cjs');
