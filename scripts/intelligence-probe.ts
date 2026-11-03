// Audit local ponctuel : aucune valeur de joueur, aucun événement brut, aucun jeton imprimé.
// Compiler depuis la racine :
// ./node_modules/.bin/esbuild scripts/intelligence-probe.ts --bundle --platform=node --format=esm --outfile=dist/intelligence-probe.mjs
import { pathToFileURL } from 'node:url';
import { collectIntelligenceDiagnostic } from '../src/core/intelligence/diagnostic';
export { summarizeSchema } from '../src/core/intelligence/diagnostic';

export async function runIntelligenceProbe(): Promise<boolean> {
  const report = await collectIntelligenceDiagnostic();
  console.log(JSON.stringify(report, null, 2));
  return report.status === 'live-acquisition-verified';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length) {
    console.error('Usage : node dist/intelligence-probe.mjs (aucun argument, connexions locales uniquement)');
    process.exitCode = 1;
  } else {
    try {
      if (!await runIntelligenceProbe()) process.exitCode = 2;
    } catch {
      // Ne pas imprimer un objet erreur susceptible de contenir une requête authentifiée.
      console.error(JSON.stringify({ status: 'probe-failed', details: 'Diagnostic local interrompu ; aucune acquisition validée.' }));
      process.exitCode = 2;
    }
  }
}
