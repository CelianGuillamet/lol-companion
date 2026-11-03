import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dd = join(__dirname, 'fixtures', 'ddragon');

/** Faux Data Dragon : sert les fichiers de test/fixtures/ddragon et note les URL demandées. */
export const ddFetcher = (calls: string[] = []) => async (url: string) => {
  calls.push(url);
  const file = url.split('/data/en_US/').pop()!.replace('champion/', '');
  return readFileSync(join(dd, file), 'utf8');
};
