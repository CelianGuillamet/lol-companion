// Vraie fenêtre Electron, faux transport HTTPS : valide l'intégration UI, pas une partie League.
const { app, BrowserWindow, globalShortcut, screen } = require('electron');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

process.on('unhandledRejection', (error) => { console.error(error); app.exit(1); });
if (!process.env.ARAM_DEMO_PORT) throw new Error('ARAM_DEMO_PORT doit désigner le faux client local');
const run = mkdtempSync(join(tmpdir(), 'aram-intelligence-ui-'));
app.setPath('userData', run);
console.log(`Artifacts: ${run}`);
Object.assign(process.env, {
  ARAM_SMOKE: '1', ARAM_SMOKE_SHOW: '1', ARAM_DATA_DIR: join(run, 'data'), ARAM_SMOKE_WAIT: '5000',
  ARAM_FIXTURES: resolve(__dirname, 'fixtures'), ARAM_DEMO_TOKEN: 'demo',
  ARAM_SMOKE_SHOT: join(run, 'intelligence.png'), ARAM_SMOKE_SIZE: '1180x780',
});
process.env.ARAM_SMOKE_JS = `
(async () => {
  const assert = (ok, why) => { if (!ok) throw new Error(why); };
  const wait = () => new Promise(r => setTimeout(r, 100));
  for (let i = 0; i < 40 && !document.querySelector('.enemy-intelligence'); i++) await wait();
  // Le scénario compact ouvre la même vue via l'URL second écran.
  const enemyTab = [...document.querySelectorAll('nav.tabs button')].find(b => b.textContent === 'Ennemis');
  if (enemyTab) { enemyTab.click(); await wait(); }
  const panel = document.querySelector('.enemy-intelligence');
  assert(panel, 'Panneau ennemi absent');
  assert(panel.querySelectorAll('.enemy-row').length === 5, 'Cinq ennemis attendus');
  assert(panel.querySelectorAll('.enemy-spells > li').length === 30, 'Six sorts par ennemi attendus');
  assert(panel.textContent.includes('Flash') && panel.textContent.includes('Teleport'), 'Sorts équipés absents');
  assert(panel.textContent.includes('non opérationnelles'), 'Limite opérationnelle absente');
  assert([...panel.querySelectorAll('.position-status dd')].every(e => /Inconnu/.test(e.textContent)), 'Une position ou visibilité non acquise est affichée');
  assert([...panel.querySelectorAll('.spell-status')].every(e => e.textContent === 'État inconnu'), 'Faux timer de sort');
  panel.querySelector('.event-details').open = true;
  panel.querySelector('.source-details').open = true;
  assert(panel.textContent.includes('DragonKill') && panel.textContent.includes('ChampionKill'), 'Événements source absents');
  assert(panel.textContent.includes('allgamedata'), 'Provenance absente');
  assert(document.documentElement.scrollWidth <= innerWidth, 'Débordement horizontal');
  panel.scrollIntoView({ block: 'start' });
  const access = document.querySelector('.enemy-access');
  assert(access, 'Accès direct aux sorts absent');
  const rect = access.getBoundingClientRect();
  assert(rect.top >= 0 && rect.bottom <= innerHeight, 'Bouton de sorts hors écran');
  access.focus(); access.click(); await wait();
  let modal = document.querySelector('.enemy-dialog[open]');
  assert(modal && modal.querySelectorAll('.enemy-row').length === 5, 'Dialogue ennemi absent ou incomplet');
  const bounds = modal.getBoundingClientRect();
  assert(bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight, 'Dialogue hors écran');
  const last = [...modal.querySelectorAll('.enemy-row')].at(-1);
  last.scrollIntoView({ block: 'end' }); await wait();
  assert(last.getBoundingClientRect().bottom <= innerHeight, 'Dernier ennemi inaccessible');
  assert(modal.querySelector('button').getBoundingClientRect().top >= 0, 'Fermeture hors écran');
  modal.querySelector('button').click(); await wait();
  assert(!document.querySelector('.enemy-dialog[open]') && document.activeElement === access, 'Fermeture ou retour du focus incorrect');
  // Tab conserve sa fonction dans les champs et les boutons.
  const input = document.createElement('input'); document.body.append(input); input.focus();
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); await wait();
  assert(!document.querySelector('.enemy-dialog[open]'), 'Tab détourné dans un champ');
  input.remove(); access.focus();
  access.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); await wait();
  assert(!document.querySelector('.enemy-dialog[open]'), 'Navigation clavier des boutons détournée');
  access.blur();
  const key = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.body.dispatchEvent(key); await wait();
  assert(key.defaultPrevented && document.querySelector('.enemy-dialog[open]'), 'Tab local n’ouvre pas les sorts');
  console.log('Intelligence UI assertions passed');
})();
`;
if (process.env.ARAM_TEST_COMPACT === '1') {
  process.env.ARAM_SMOKE_SIZE = '390x844';
  let mainSeen = false;
  app.on('browser-window-created', (_event, win) => {
    if (mainSeen) return;
    mainSeen = true;
    win.webContents.once('did-finish-load', () => {
      win.setMinimumSize(320, 500);
      win.setContentSize(390, 844);
      void win.webContents.executeJavaScript("location.hash = '#second'; setTimeout(() => location.reload(), 0); true");
    });
  });
}

let enemyShortcut;
const register = globalShortcut.register.bind(globalShortcut);
globalShortcut.register = (key, callback) => {
  if (key === 'CommandOrControl+Shift+E') enemyShortcut = callback;
  return register(key, callback);
};
let mainInstrumented = false;
app.on('browser-window-created', (_event, win) => {
  if (mainInstrumented) return;
  mainInstrumented = true;
  const execute = win.webContents.executeJavaScript.bind(win.webContents);
  win.webContents.executeJavaScript = async (code, ...args) => {
    if (code === process.env.ARAM_SMOKE_JS) win.focus();
    const result = await execute(code, ...args);
    if (code === process.env.ARAM_SMOKE_JS) {
      const wait = (ms = 100) => new Promise(r => setTimeout(r, ms));
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
      await wait();
      if (await execute("!!document.querySelector('.enemy-dialog[open]')")) throw new Error('Échap ne ferme pas le dialogue');
      if (!enemyShortcut) throw new Error('Raccourci global des ennemis absent');
      enemyShortcut();
      let enemy;
      for (let i = 0; i < 50; i++) {
        enemy = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('#enemies'));
        if (enemy && !enemy.webContents.isLoading() && await enemy.webContents.executeJavaScript("document.querySelectorAll('.enemy-row').length === 5")) break;
        await wait();
      }
      if (!enemy || enemy.isDestroyed()) throw new Error('Fenêtre ennemie absente');
      const inside = () => {
        const b = enemy.getBounds(); const a = screen.getDisplayMatching(b).workArea;
        if (b.x < a.x || b.y < a.y || b.x + b.width > a.x + a.width || b.y + b.height > a.y + a.height) throw new Error('Fenêtre ennemie hors écran');
      };
      inside();
      if (!(await enemy.webContents.executeJavaScript("document.querySelectorAll('.enemy-spells > li').length === 30"))) throw new Error('Sorts manquants dans la fenêtre dédiée');
      enemyShortcut(); // masque
      enemy.setPosition(-4000, -4000);
      enemyShortcut(); // recale avant affichage
      inside();
      await wait();
      require('node:fs').writeFileSync(join(run, 'enemy-window.png'), (await enemy.webContents.capturePage()).toPNG());
      enemy.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      enemy.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
      for (let i = 0; i < 20 && !enemy.isDestroyed(); i++) await wait();
      if (!enemy.isDestroyed()) throw new Error('Échap ne ferme pas la fenêtre ennemie');
      win.focus();
      await execute("document.querySelector('.enemy-access').click()");
      console.log('Enemy panel keyboard/window assertions passed');
    }
    return result;
  };
});
require('../dist/electron/main.cjs');
