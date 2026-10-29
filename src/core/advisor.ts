// Conseiller cartes / banc.
// Le calcul de composition est un portage TypeScript de team_composition / team_composition_score
// d'arammeta (Lanternko/ARAM-Mayhem-Database, src/aram_nn/site/meta_pick.py, licence MIT).

import type { Candidate, Mode, Reason, TeamNeeds } from './types';
import type { MetaChampion, TierList } from './arammeta';

const DIMS = ['wave', 'cc', 'engage', 'damage', 'poke', 'sustain', 'front'] as const;
type Dim = (typeof DIMS)[number];

export const DIM_LABEL: Record<Dim, string> = {
  wave: 'nettoyage de vagues',
  cc: 'contrôle',
  engage: 'engage',
  damage: 'dégâts',
  poke: 'poke',
  sustain: 'soin / survie',
  front: 'frontline',
};

function adBin(share: number): string {
  if (share < 0.35) return '<35% AD';
  if (share < 0.45) return '35-45% AD';
  if (share < 0.55) return '45-55% AD';
  if (share < 0.65) return '55-65% AD';
  return '>=65% AD';
}

function countGroup(n: number): string {
  if (n < 0.5) return '0';
  if (n < 1.5) return '1';
  return '2+';
}

export interface TeamComposition {
  adShare: number;
  lacks: Record<Dim, boolean>;
  frontCount: number;
  keys: Record<string, string>;
}

export function teamComposition(ids: number[], meta: TierList): TeamComposition {
  const thresholds = meta.recommendation_composition?.lack_thresholds ?? {};
  const sums: Record<string, number> = { phys: 0, magic: 0, wave: 0, cc: 0, engage: 0, damage: 0, poke: 0, sustain: 0, front: 0 };
  const roles = { Mage: 0, Marksman: 0 };
  let frontCount = 0;
  let known = 0;
  for (const id of ids) {
    const c = meta.champs[String(id)];
    if (!c?.comp) continue;
    known++;
    for (const k of Object.keys(sums)) sums[k] += Number((c.comp as unknown as Record<string, number>)[k] || 0);
    if (Number(c.comp.front || 0) >= 2) frontCount++;
    for (const t of c.tags || []) if (t === 'Mage' || t === 'Marksman') roles[t]++;
  }
  const size = Math.max(1, known);
  const projection = 5 / size;
  const thresholdScale = size / 5;
  const adDen = sums.phys + sums.magic;
  const adShare = adDen > 0 ? sums.phys / adDen : 0.5;
  const lacks = {} as Record<Dim, boolean>;
  for (const d of DIMS) {
    const t = Number(thresholds[d] || 0);
    lacks[d] = t > 0 && sums[d] < t * thresholdScale;
  }
  const allLacks = DIMS.filter((d) => lacks[d]).length;
  const frontGroup = countGroup(frontCount * projection) + ' front';
  return {
    adShare,
    lacks,
    frontCount,
    keys: {
      ad_front: `${frontGroup}|${adBin(adShare)}`,
      poke_front: `${frontGroup}|${lacks.poke ? 'poke lack' : 'poke ok'}`,
      wave_engage: `${lacks.wave ? 'wave lack' : 'wave ok'}|${lacks.engage ? 'engage lack' : 'engage ok'}`,
      all_lacks: countGroup(allLacks * projection),
      mage_ad: `${countGroup(roles.Mage * projection)}|${adBin(adShare)}`,
      marksman_ad: `${countGroup(roles.Marksman * projection)}|${adBin(adShare)}`,
    },
  };
}

/** Effet estimé de la composition sur le winrate (fraction, ex. 0.012 = +1,2 pt). */
export function compositionScore(ids: number[], meta: TierList): number {
  const known = ids.filter((id) => meta.champs[String(id)]?.comp);
  if (!known.length) return 0;
  const cfg = meta.recommendation_composition ?? {};
  const weights = cfg.table_weights ?? {};
  const tables = cfg.tables ?? {};
  const comp = teamComposition(known, meta);
  let score = 0;
  for (const [table, key] of Object.entries(comp.keys)) {
    score += Number(weights[table] || 0) * Number(tables[table]?.[key] || 0);
  }
  const clamp = Number(cfg.clamp ?? 0.05);
  const sizeWeight = Math.min(1, Math.max(0, (known.length - 1) / 4));
  return Math.max(-clamp, Math.min(clamp, score)) * sizeWeight;
}

/** Synergie de paire (lift) entre deux champions, moyenne des deux sens si disponibles. */
export function pairLift(meta: TierList, a: number, b: number): number | null {
  const ab = meta.champs[String(a)]?.pairs?.find((p) => p.id === b);
  const ba = meta.champs[String(b)]?.pairs?.find((p) => p.id === a);
  if (ab && ba) return (ab.lift + ba.lift) / 2;
  const one = ab || ba;
  return one ? one.lift : null;
}

export interface CandidateInput {
  championId: number;
  source: Candidate['source'];
  actionable: boolean;
  /** Échange avec un allié : l'équipe change (ton champion part chez lui), on la compte à sa place. */
  alliesOverride?: number[];
}

export interface AdviceInput {
  mode: Mode;
  allies: number[]; // champions des 4 alliés (0 exclu)
  candidates: CandidateInput[];
  personal: Map<number, { games: number; wins: number }>;
  names: (id: number) => string;
}

const pts = (fraction: number) => Math.round(fraction * 1000) / 10; // 0.0123 -> 1.2
const fr = (n: number, d = 1) => n.toFixed(d).replace('.', ',');

export function needsOf(allies: number[], meta: TierList | null): TeamNeeds {
  if (!meta || !allies.length) return { adShare: 0.5, lacks: [], frontliners: 0 };
  const comp = teamComposition(allies, meta);
  const lacks = DIMS.filter((d) => comp.lacks[d]).map((d) => DIM_LABEL[d]);
  // arammeta compte comme « front » un champion avec un score de frontline >= 2 : aucun = pas de vrai tank.
  if (comp.frontCount === 0 && allies.length >= 2 && !lacks.includes(DIM_LABEL.front)) lacks.unshift(DIM_LABEL.front);
  return { adShare: comp.adShare, lacks, frontliners: comp.frontCount };
}

export function scoreCandidates(input: AdviceInput, meta: TierList | null): Candidate[] {
  const allies = input.allies.filter((id) => id > 0);
  // En ARAM classique, les winrates arammeta (Mayhem) ne sont qu'indicatifs : poids réduit.
  const wrWeight = input.mode === 'mayhem' ? 1 : 0.5;
  const defaultBase = meta ? compositionScore(allies, meta) : 0;
  const seen = new Set<number>();
  const out: Candidate[] = [];

  for (const cand of input.candidates) {
    if (!cand.championId || seen.has(cand.championId)) continue;
    seen.add(cand.championId);
    const team = cand.alliesOverride?.filter((id) => id > 0) ?? allies;
    const baseComp = cand.alliesOverride && meta ? compositionScore(team, meta) : defaultBase;
    const reasons: Reason[] = [];
    const m: MetaChampion | null = meta?.champs[String(cand.championId)] ?? null;
    let score = 0;

    if (m) {
      const p = pts((m.wr - 0.5) * wrWeight);
      score += p;
      reasons.push({
        label: input.mode === 'mayhem' ? `Winrate Mayhem ${fr(m.wr * 100)} %` : `Winrate Mayhem ${fr(m.wr * 100)} % (indicatif en ARAM)`,
        points: p,
      });

      let syn = 0;
      const synNames: string[] = [];
      for (const a of team) {
        const l = pairLift(meta!, cand.championId, a);
        if (l != null && Math.abs(l) >= 0.005) {
          syn += l;
          synNames.push(`${input.names(a)} ${l > 0 ? '+' : ''}${fr(pts(l))}`);
        }
      }
      if (synNames.length) {
        const p2 = pts(syn);
        score += p2;
        reasons.push({ label: `Synergie : ${synNames.join(', ')}`, points: p2 });
      }

      const withMe = compositionScore([...team, cand.championId], meta!);
      const p3 = pts(withMe - baseComp);
      if (Math.abs(p3) >= 0.1) {
        score += p3;
        const before = teamComposition(team, meta!);
        const after = teamComposition([...team, cand.championId], meta!);
        const filled = DIMS.filter((d) => before.lacks[d] && !after.lacks[d]).map((d) => DIM_LABEL[d]);
        if (before.frontCount === 0 && after.frontCount > 0 && !filled.includes(DIM_LABEL.front)) filled.unshift('frontline');
        const adShift = after.adShare - before.adShare;
        const balance = Math.abs(before.adShare - 0.5) > 0.15 && Math.abs(after.adShare - 0.5) < Math.abs(before.adShare - 0.5) ? (adShift < 0 ? 'dégâts magiques' : 'dégâts physiques') : null;
        const parts = [...filled, ...(balance ? [balance] : [])];
        const label = p3 > 0 ? (parts.length ? `Compo : apporte ${parts.join(', ')}` : 'Compo de l’équipe') : 'Compo : déséquilibre l’équipe';
        reasons.push({ label, points: p3 });
      }
    } else {
      reasons.push({ label: 'Pas de données globales pour ce champion', points: 0 });
    }

    const perso = input.personal.get(cand.championId) ?? null;
    if (perso && perso.games >= 3) {
      // Lissage vers 50 % avec 5 parties fictives pour ne pas surréagir à 3 parties.
      const wr = (perso.wins + 2.5) / (perso.games + 5);
      const p4 = pts((wr - 0.5) * 0.5);
      score += p4;
      reasons.push({ label: `Toi : ${perso.wins}V / ${perso.games - perso.wins}D`, points: p4 });
    }

    out.push({
      championId: cand.championId,
      name: input.names(cand.championId),
      source: cand.source,
      score: Math.round(score * 10) / 10,
      winrate: m?.wr ?? null,
      games: m?.g ?? 0,
      personal: perso,
      reasons,
      actionable: cand.actionable,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}
