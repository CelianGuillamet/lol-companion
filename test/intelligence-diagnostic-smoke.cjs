// Vrai IPC + collecteur local + fichier JSON ; seule la boîte de dialogue native est remplacée.
const { app, dialog } = require('electron');
const { mkdtempSync, readFileSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

process.on('unhandledRejection', (error) => { console.error(error); app.exit(1); });
const run = mkdtempSync(join(tmpdir(), 'aram-diagnostic-ui-'));
const reportPath = join(run, 'diagnostic.json');
app.setPath('userData', run);
console.log(`Artifacts: ${run}`);
Object.assign(process.env, {
  ARAM_SMOKE: '1', ARAM_SMOKE_SHOW: '1', ARAM_DATA_DIR: join(run, 'data'), ARAM_SMOKE_WAIT: '1500',
  ARAM_FIXTURES: resolve(__dirname, 'fixtures'), ARAM_SMOKE_TAB: 'settings',
  ARAM_SMOKE_SHOT: join(run, 'diagnostic.png'), ARAM_SMOKE_SIZE: '1180x780',
});
let dialogs = 0;
dialog.showSaveDialog = async () => ++dialogs === 1 ? { canceled: true } : { canceled: false, filePath: reportPath };
process.env.ARAM_SMOKE_JS = `
(async () => {
  const assert = (ok, why) => { if (!ok) throw new Error(why); };
  const wait = () => new Promise(r => setTimeout(r, 100));
  const until = async (f, why) => { for (let i = 0; i < 100; i++) { if (f()) return; await wait(); } throw new Error(why); };
  const section = document.querySelector('[aria-labelledby="diagnostic-title"]');
  assert(section, 'Section diagnostic absente');
  const button = section.querySelector('button');
  button.click();
  await until(() => section.textContent.includes('Enregistrement annulé.'), 'Annulation non affichée');
  assert(!button.disabled, 'Bouton bloqué après annulation');
  button.click();
  await Promise.resolve();
  assert(button.textContent.includes('Diagnostic en cours') || button.disabled, 'État de chargement absent');
  await until(() => section.textContent.includes('Rapport enregistré.'), 'Export non confirmé');
  assert(!button.disabled, 'Bouton bloqué après export');
  assert(section.textContent.includes('non validés') || section.textContent.includes('Aucune acquisition'), 'Disponibilité trompeuse');
  section.scrollIntoView({ block: 'center' });
  assert(document.documentElement.scrollWidth <= innerWidth, 'Débordement horizontal');
  return true;
})();
`;
let mainSeen = false;
app.on('browser-window-created', (_event, win) => {
  if (mainSeen) return;
  mainSeen = true;
  const execute = win.webContents.executeJavaScript.bind(win.webContents);
  win.webContents.executeJavaScript = async (code, ...args) => {
    const result = await execute(code, ...args);
    if (code === process.env.ARAM_SMOKE_JS) {
      if (!existsSync(reportPath)) throw new Error('Rapport JSON absent');
      const raw = readFileSync(reportPath, 'utf8');
      const output = JSON.parse(raw);
      if (output.version !== 1 || !output.createdAt || !output.report?.live) throw new Error('Structure du rapport invalide');
      if (output.report.capabilities.enemyCoordinates !== 'unvalidated' || output.report.capabilities.enemySpellCasts !== 'unvalidated') throw new Error('Validation cachée inventée');
      if (/Celian#|Enemy[0-9]#|Authorization|Basic |remoting-auth-token/.test(raw)) throw new Error('Valeur personnelle ou secret dans le rapport');
      if (dialogs !== 2) throw new Error('Annulation et enregistrement non exercés');
      console.log('Diagnostic IPC/export assertions passed');
    }
    return result;
  };
});
require('../dist/electron/main.cjs');
