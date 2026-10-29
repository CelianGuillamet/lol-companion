// Calculs perso à partir de l'historique (côté interface, sans appel au client).

import type { HistoryEntry, IconItem } from '../core/types';

export interface Agg {
  item: IconItem;
  games: number;
  wins: number;
}

const perMin = (x: number | undefined, sec: number) => (x != null && sec > 0 ? (x * 60) / sec : null);
const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export function aggregate(games: HistoryEntry[], pick: (g: HistoryEntry) => IconItem[]): Agg[] {
  const m = new Map<number, Agg>();
  for (const g of games) {
    for (const it of pick(g)) {
      const e = m.get(it.id) ?? { item: it, games: 0, wins: 0 };
      e.games++;
      if (g.win) e.wins++;
      m.set(it.id, e);
    }
  }
  return [...m.values()].sort((a, b) => b.games - a.games || b.wins - a.wins);
}

export interface Recap {
  game: HistoryEntry;
  base: number; // nombre de parties de comparaison
  lines: { text: string; good: boolean }[];
}

/**
 * Bilan d'une partie comparée à tes autres parties sur le même champion (sinon toutes tes parties) :
 * dégâts/min, morts, participation aux kills. On ne garde que les écarts nets (≥ 20 %).
 */
export function recap(game: HistoryEntry, all: HistoryEntry[]): Recap | null {
  let ref = all.filter((g) => g.gameId !== game.gameId && g.championId === game.championId);
  let scope = 'sur ce champion';
  if (ref.length < 3) {
    ref = all.filter((g) => g.gameId !== game.gameId && g.mode === game.mode);
    scope = 'en moyenne';
  }
  if (ref.length < 3) return null;
  const lines: Recap['lines'] = [];
  const cmp = (cur: number | null, avg: number | null, label: string, higherIsGood: boolean, unit = '') => {
    if (cur == null || avg == null || avg === 0) return;
    const d = (cur - avg) / avg;
    if (Math.abs(d) < 0.2) return;
    const up = d > 0;
    lines.push({
      text: `${label} : ${Math.round(cur).toLocaleString('fr-FR')}${unit} contre ${Math.round(avg).toLocaleString('fr-FR')}${unit} ${scope} (${up ? '+' : '−'}${Math.round(Math.abs(d) * 100)} %)`,
      good: up === higherIsGood,
    });
  };
  cmp(perMin(game.damage, game.durationSec), mean(ref.map((g) => perMin(g.damage, g.durationSec))), 'Dégâts/min', true);
  // Pas les morts : sur l'historique réel, autant de morts en victoire qu'en défaite (13,3 / 13,4) en Mayhem.
  const kp = (g: HistoryEntry) => (g.teamKills ? Math.min(1, (g.kills + g.assists) / g.teamKills) * 100 : null);
  cmp(kp(game), mean(ref.map(kp)), 'Participation', true, ' %');
  return { game, base: ref.length, lines };
}
