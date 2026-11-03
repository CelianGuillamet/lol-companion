// Vraie fenêtre Electron, faux transport HTTPS : valide l'intégration UI, pas une partie League.
const { app } = require('electron');
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
  assert(panel.querySelectorAll('.enemy-spells > li').length === 10, 'Deux sorts d’invocateur par ennemi attendus');
  assert(panel.textContent.includes('Flash') && panel.textContent.includes('Teleport'), 'Sorts équipés absents');
  assert(panel.textContent.includes('non opérationnelles'), 'Limite opérationnelle absente');
  assert([...panel.querySelectorAll('.position-status dd')].every(e => /Inconnu/.test(e.textContent)), 'Une position ou visibilité non acquise est affichée');
  panel.querySelector('.event-details').open = true;
  panel.querySelector('.source-details').open = true;
  assert(panel.textContent.includes('DragonKill') && panel.textContent.includes('ChampionKill'), 'Événements source absents');
  assert(panel.textContent.includes('allgamedata'), 'Provenance absente');
  assert(document.documentElement.scrollWidth <= innerWidth, 'Débordement horizontal');
  // Aucun timer de sorts ennemis (interdits par les règles Riot) : ni bouton, ni dialogue, ni donnée, ni action.
  assert(!document.querySelector('.enemy-access, .enemy-dialog, .spells .cell'), 'Timer de sorts ennemis encore affiché');
  assert(!('enemySpells' in (await window.api.getState())), 'Timers de sorts ennemis encore dans l’état');
  assert(typeof window.api.markEnemySpell === 'undefined', 'Action de signalement encore exposée');
  const key = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.body.dispatchEvent(key); await wait();
  assert(!key.defaultPrevented, 'Tab encore détourné');
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

require('../dist/electron/main.cjs');
