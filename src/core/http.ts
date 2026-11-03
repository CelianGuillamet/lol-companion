// Requêtes HTTPS vers les sources de données (arammeta, OP.GG, wiki, Data Dragon…), en un seul endroit.
// Une réponse coupée en cours de route (Wi-Fi qui saute, serveur qui ferme) émet « aborted » / « error » sur la
// réponse sans jamais émettre « end » : sans gestionnaire, la promesse restait en attente pour toujours, ou l'erreur
// non écoutée faisait tomber le processus principal. Ici, chaque requête a une seule issue.

import https from 'node:https';

export const USER_AGENT = 'aram-companion (usage perso)';

export interface HttpResult {
  status: number;
  /** En-têtes, noms en minuscules. */
  headers: Record<string, string>;
  text: string;
}

export function httpsText(
  url: string,
  opts: { timeoutMs: number; method?: string; body?: string; headers?: Record<string, string>; timeoutLabel?: string; agent?: https.Agent },
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (e: Error) => {
      if (settled) return;
      settled = true;
      reject(e);
    };
    const req = https.request(
      url,
      { method: opts.method ?? 'GET', timeout: opts.timeoutMs, headers: { 'User-Agent': USER_AGENT, ...opts.headers }, ...(opts.agent ? { agent: opts.agent } : {}) },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (text += c));
        res.on('error', fail);
        res.on('aborted', () => fail(new Error('réponse interrompue')));
        res.on('close', () => {
          if (!res.complete) fail(new Error('réponse interrompue'));
        });
        res.on('end', () => {
          if (settled) return;
          if (!res.complete) return fail(new Error('réponse interrompue'));
          settled = true;
          resolve({
            status: res.statusCode ?? 0,
            headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k.toLowerCase(), String(v)])),
            text,
          });
        });
      },
    );
    req.on('error', fail);
    req.on('timeout', () => req.destroy(new Error(opts.timeoutLabel ?? 'délai dépassé')));
    req.end(opts.body);
  });
}

/** Texte d'une URL ; refuse tout statut autre que 200. `label` complète les messages d'erreur (souvent l'URL). */
export async function download(url: string, timeoutMs: number, label?: string): Promise<string> {
  const suffix = label ? ` (${label})` : '';
  const r = await httpsText(url, { timeoutMs, timeoutLabel: `délai dépassé${suffix}` });
  if (r.status !== 200) throw new Error(`HTTP ${r.status}${suffix}`);
  return r.text;
}
