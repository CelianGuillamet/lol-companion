// Items situationnels selon l'équipe adverse (comme Hexgate), à partir du profil de composition arammeta
// de chaque champion (comp : dégâts phys/magiques/vrais, front, sustain, cc — même échelle que advisor.ts).

import type { MetaComp } from './arammeta';

export type BuildRole = 'ad' | 'ap' | 'tank';
export type ThreatKey = 'antiheal' | 'armor' | 'mr' | 'pen' | 'tenacity' | 'crit' | 'attackspeed';

export interface EnemyInput {
  id: number;
  comp: MetaComp | null | undefined;
  /** Poids en partie (1 = normal) : un ennemi qui a beaucoup de kills compte davantage. */
  weight?: number;
}

/** Poids d'un ennemi selon son score en partie : +15 % par kill d'avance sur ses morts, plafonné à ×2,5. */
export function fedWeight(kills: number, deaths: number): number {
  return Math.min(2.5, 1 + Math.max(0, kills - deaths) * 0.15);
}

export interface Threat {
  key: ThreatKey;
  title: string;
  why: string;
  champions: number[]; // ennemis responsables
  items: number[]; // ids d'items conseillés, dans l'ordre
  /** Assez fort pour passer avant la fin du build (ex. 70 % de dégâts magiques en face). */
  urgent?: boolean;
}

// Items vérifiés dans l'itemLut d'arammeta (patch 16.21).
const ITEMS: Record<ThreatKey, Record<BuildRole, number[]>> = {
  antiheal: {
    ad: [3123, 3033, 6609], // Executioner's Calling, Mortal Reminder, Chempunk Chainsword
    ap: [3916, 3165], // Oblivion Orb, Morellonomicon
    tank: [3076, 3075], // Bramble Vest, Thornmail
  },
  armor: {
    ad: [3047, 6333], // Plated Steelcaps, Death's Dance
    ap: [3047, 3157], // Plated Steelcaps, Zhonya's Hourglass
    tank: [3047, 3143, 3110, 3075], // Steelcaps, Randuin's, Frozen Heart, Thornmail
  },
  mr: {
    ad: [3111, 3156, 3814], // Mercury's Treads, Maw of Malmortius, Edge of Night
    ap: [3111, 3102], // Mercury's Treads, Banshee's Veil
    tank: [3111, 4401, 2504, 3065], // Mercury's, Force of Nature, Kaenic Rookern, Spirit Visage
  },
  pen: {
    ad: [3036, 3071, 6694], // Lord Dominik's, Black Cleaver, Serylda's Grudge
    ap: [3135, 6653, 8010], // Void Staff, Liandry's, Bloodletter's Curse
    tank: [],
  },
  tenacity: {
    ad: [3111, 3139], // Mercury's Treads, Mercurial Scimitar
    ap: [3111],
    tank: [3111],
  },
  // D'après les items achetés en face (tableau des scores, API Live Client)
  crit: {
    ad: [3047, 6333], // Plated Steelcaps, Death's Dance (Guardian Angel n'existe pas en Mayhem)
    ap: [3047, 3157], // Plated Steelcaps, Zhonya's Hourglass
    tank: [3143, 3047], // Randuin's Omen, Plated Steelcaps
  },
  attackspeed: {
    ad: [3047], // Plated Steelcaps
    ap: [3047, 3157],
    tank: [3110, 3047, 3075], // Frozen Heart, Plated Steelcaps, Thornmail
  },
};

const TOTAL = (c: MetaComp) => Math.max(1, c.phys + c.magic + (c.true ?? 0));

/** Profil de build de ton champion : tank si c'est une ligne de front, sinon AD ou AP selon ses dégâts. */
export function buildRole(comp: MetaComp | null | undefined): BuildRole {
  if (!comp) return 'ad';
  if (comp.front >= 2.3 && comp.damage < 1) return 'tank';
  return comp.phys >= comp.magic ? 'ad' : 'ap';
}

export function enemyThreats(enemies: EnemyInput[], role: BuildRole): Threat[] {
  const known = enemies.filter((e): e is { id: number; comp: MetaComp; weight?: number } => !!e.comp);
  const w = (e: { weight?: number }) => e.weight ?? 1;
  if (!known.length) return [];
  const out: Threat[] = [];
  const add = (key: ThreatKey, title: string, why: string, champions: number[], urgent = false) => {
    const items = ITEMS[key][role];
    if (items.length) out.push({ key, title, why, champions, items, ...(urgent ? { urgent } : {}) });
  };

  const healers = known.filter((e) => e.comp.sustain >= 2.3).sort((a, b) => b.comp.sustain - a.comp.sustain);
  const sustain = known.reduce((s, e) => s + e.comp.sustain * w(e), 0);
  if (healers.length >= 2 || sustain >= 9.5) {
    add('antiheal', 'Anti-soins', `${healers.length} ennemi(s) qui se soignent ou protègent beaucoup`, healers.map((e) => e.id), healers.length >= 3 || sustain >= 12);
  }

  const phys = known.reduce((s, e) => s + e.comp.phys * w(e), 0);
  const magic = known.reduce((s, e) => s + e.comp.magic * w(e), 0);
  const all = known.reduce((s, e) => s + TOTAL(e.comp) * w(e), 0);
  const physShare = phys / all;
  const magicShare = magic / all;
  const mainly = (k: 'phys' | 'magic') => known.filter((e) => e.comp[k] / TOTAL(e.comp) >= 0.6).map((e) => e.id);
  if (physShare >= 0.6) add('armor', 'Armure', `${Math.round(physShare * 100)} % de leurs dégâts sont physiques`, mainly('phys'), physShare >= 0.7);
  if (magicShare >= 0.6) add('mr', 'Résistance magique', `${Math.round(magicShare * 100)} % de leurs dégâts sont magiques`, mainly('magic'), magicShare >= 0.7);

  const tanks = known.filter((e) => e.comp.front >= 2);
  if (tanks.length >= 3) add('pen', 'Pénétration', `${tanks.length} lignes de front en face`, tanks.map((e) => e.id));

  const cc = known.reduce((s, e) => s + e.comp.cc, 0);
  if (cc >= 10 && !out.some((t) => t.key === 'mr')) {
    const ccers = known.filter((e) => e.comp.cc >= 2.2).map((e) => e.id);
    add('tenacity', 'Ténacité', 'Beaucoup de contrôles en face', ccers);
  }
  return out;
}

/** Équipe adverse d'après la session de jeu du client (teamOne / teamTwo). */
export function enemiesFromSession(
  gameData: { teamOne?: { puuid?: string; championId?: number }[]; teamTwo?: { puuid?: string; championId?: number }[] } | undefined,
  puuid: string,
): number[] {
  const one = gameData?.teamOne ?? [];
  const two = gameData?.teamTwo ?? [];
  const mineIsOne = one.some((p) => p.puuid === puuid);
  const mineIsTwo = two.some((p) => p.puuid === puuid);
  if (!mineIsOne && !mineIsTwo) return [];
  return (mineIsOne ? two : one).map((p) => p.championId ?? 0).filter((id) => id > 0);
}

// ---------------------------------------------------------------- lecture des deux équipes (en partie)

/** Items qui appliquent les blessures graves (anti-soins). */
export const ANTIHEAL_ITEMS = new Set([3123, 3033, 6609, 3916, 3165, 3076, 3075]);

export type DamageKind = 'AD' | 'AP' | 'mixte';

export function damageKind(comp: MetaComp | null | undefined): DamageKind | null {
  if (!comp) return null;
  const t = TOTAL(comp);
  if (comp.phys / t >= 0.65) return 'AD';
  if (comp.magic / t >= 0.65) return 'AP';
  return 'mixte';
}

/**
 * Profil de dégâts corrigé par ce que le joueur construit vraiment (tableau des scores) : une Kayle full AP ou un
 * Ezreal AP ne font pas les dégâts « moyens » du champion. À partir de 2 items finis offensifs.
 */
export function compFromItems(comp: MetaComp | null | undefined, items: number[], cat: (id: number) => string[]): { comp: MetaComp | null | undefined; built: DamageKind | null } {
  const ad = items.filter((i) => cat(i).some((c) => c === 'Damage' || c === 'CriticalStrike' || c === 'AttackSpeed')).length;
  const ap = items.filter((i) => cat(i).includes('SpellDamage')).length;
  if (!comp || ad + ap < 2) return { comp, built: null };
  const share = ad / (ad + ap);
  const dmg = comp.phys + comp.magic;
  const built: DamageKind = share >= 0.65 ? 'AD' : share <= 0.35 ? 'AP' : 'mixte';
  return { comp: { ...comp, phys: dmg * share, magic: dmg * (1 - share) }, built };
}

/** Ce que fait le champion, en mots courts (pour comprendre pourquoi on conseille un item). */
export function championTags(comp: MetaComp | null | undefined): string[] {
  if (!comp) return [];
  const out: string[] = [];
  if (comp.front >= 2) out.push('tank');
  if (comp.sustain >= 2.3) out.push('soins');
  if (comp.cc >= 2.2) out.push('contrôles');
  return out;
}

export interface TeamMember {
  id: number;
  name: string;
  comp: MetaComp | null | undefined;
  items: number[];
  kills?: number;
  deaths?: number;
}

export interface TeamRead {
  notes: string[];
  /** Menaces ajoutées d'après les items réellement achetés en face (ex. ils empilent l'armure). */
  extra: Threat[];
}

/**
 * Ce que les deux équipes changent à ton achat, d'après leurs champions et leurs items en direct.
 * `cat` : catégories d'un item (client), `itemName` pour citer l'item.
 */
export function readTeams(
  role: BuildRole,
  allies: TeamMember[],
  enemies: TeamMember[],
  threats: Threat[],
  cat: (id: number) => string[],
  itemName: (id: number) => string,
): TeamRead {
  const notes: string[] = [];
  const extra: Threat[] = [];
  const has = (k: ThreatKey) => threats.some((t) => t.key === k);

  // Anti-soins déjà chez un allié
  if (has('antiheal')) {
    const a = allies.find((m) => m.items.some((i) => ANTIHEAL_ITEMS.has(i)));
    if (a) notes.push(`${a.name} a déjà de l’anti-soins (${itemName(a.items.find((i) => ANTIHEAL_ITEMS.has(i))!)}) : un 2e n’est utile que si tu frappes souvent les soigneurs.`);
  }

  // Résistances empilées en face : pénétration
  const count = (c: string) => enemies.reduce((n, e) => n + e.items.filter((i) => cat(i).includes(c)).length, 0);
  const armor = count('Armor');
  const mr = count('SpellBlock');
  const holders = (c: string) => enemies.filter((e) => e.items.some((i) => cat(i).includes(c))).map((e) => e.id);
  if (role === 'ad' && armor >= 4 && !has('pen')) {
    extra.push({ key: 'pen', title: 'Pénétration d’armure', why: `${armor} items d’armure en face`, champions: holders('Armor'), items: ITEMS.pen.ad });
    notes.push(`Ils ont déjà ${armor} items d’armure : la pénétration rapporte plus qu’un item de dégâts de plus.`);
  }
  if (role === 'ap' && mr >= 4 && !has('pen')) {
    extra.push({ key: 'pen', title: 'Pénétration magique', why: `${mr} items de résistance magique en face`, champions: holders('SpellBlock'), items: ITEMS.pen.ap });
    notes.push(`Ils ont déjà ${mr} items de résistance magique : Void Staff vaut le coup.`);
  }

  // Ce qu'ils construisent vraiment (tableau des scores) : critiques, vitesse d'attaque, vol de vie
  const critN = count('CriticalStrike');
  // 3 items à critiques au moins (une Jinx seule avec 2 items ne justifie pas de changer ton build)
  if (critN >= 3 && !has('crit')) {
    extra.push({ key: 'crit', title: 'Coups critiques', why: `${critN} items à critiques en face`, champions: holders('CriticalStrike'), items: ITEMS.crit[role], urgent: critN >= 4 });
  }
  const asN = count('AttackSpeed');
  if (asN >= 3 && !has('attackspeed')) {
    extra.push({ key: 'attackspeed', title: 'Attaques rapides', why: `${asN} items de vitesse d’attaque en face`, champions: holders('AttackSpeed'), items: ITEMS.attackspeed[role] });
  }
  const vampN = count('LifeSteal') + count('SpellVamp');
  if (vampN >= 2 && !has('antiheal')) {
    const champs = [...new Set([...holders('LifeSteal'), ...holders('SpellVamp')])];
    extra.push({ key: 'antiheal', title: 'Anti-soins', why: `${vampN} items de vol de vie en face`, champions: champs, items: ITEMS.antiheal[role] });
  }

  // Ligne de front de ton équipe
  const front = allies.filter((m) => (m.comp?.front ?? 0) >= 2);
  if (role === 'tank' && !front.length) notes.push('Tu es le seul tank de ton équipe : santé et résistances avant tout.');
  if (role !== 'tank' && !front.length && allies.length >= 3) notes.push('Aucun tank chez vous : un item défensif tôt (Zhonya, Sterak, Danse de la mort…) évite de mourir en premier.');

  // Ennemi en avance : sa menace compte double
  const fed = enemies
    .filter((e) => (e.kills ?? 0) - (e.deaths ?? 0) >= 4)
    .sort((a, b) => (b.kills ?? 0) - (b.deaths ?? 0) - ((a.kills ?? 0) - (a.deaths ?? 0)))[0];
  if (fed) {
    const k = damageKind(fed.comp);
    const res = k === 'AD' ? 'l’armure compte double' : k === 'AP' ? 'la résistance magique compte double' : 'ses dégâts sont mixtes, la santé compte plus';
    notes.push(`${fed.name} est en avance (${fed.kills}/${fed.deaths}) : ${res}.`);
  }
  return { notes, extra };
}

/**
 * L'item du build du champion qui répond à une menace (ex. Death's Dance a de l'armure → contre les critiques),
 * avant les items génériques : un item déjà joué et gagnant sur ce champion vaut mieux qu'un contre « standard ».
 */
export function fitsThreat(key: string, id: number, cat: (id: number) => string[]): boolean {
  const c = cat(id);
  switch (key) {
    case 'armor':
    case 'crit':
    case 'attackspeed':
      return c.includes('Armor');
    case 'mr':
      return c.includes('SpellBlock');
    case 'antiheal':
      return ANTIHEAL_ITEMS.has(id);
    case 'pen':
      return c.includes('ArmorPenetration') || c.includes('MagicPenetration');
    case 'tenacity':
      return c.includes('Tenacity');
    default:
      return false;
  }
}

/** Items conseillés contre une menace : ceux du build du champion qui y répondent (meilleur winrate d'abord), puis les génériques. */
export function counterItemsFor(key: string, generic: number[], tested: { id: number; winrate: number }[], cat: (id: number) => string[]): number[] {
  const own = tested.filter((t) => fitsThreat(key, t.id, cat)).sort((a, b) => b.winrate - a.winrate).map((t) => t.id);
  return [...new Set([...own, ...generic])];
}
