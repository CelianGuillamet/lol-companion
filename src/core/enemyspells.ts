// Timers des sorts ennemis (ultime + 2 sorts d'invocateur), démarrés à la main.
// Ce que l'app sait seule : quels sorts chaque ennemi a, son niveau, ses objets (API Live Client, comme le tableau des
// scores) → le vrai cooldown du patch avec la haste visible. Ce qu'elle ne sait pas et ne cherche pas à savoir : quand
// il lance un sort. Tu le signales ; le timer suit ensuite le temps de jeu et ses achats de haste.

import { APPROX_SUMMONERS, ARAM_SUMMONER_HASTE, HIDDEN, SUMMONER_FALLBACK, isAugmentSpell, rescale, summonerKey, ultRank, withHaste, type CooldownData } from './cooldowns';
import type { EnemySpellAction, EnemySpellPanel, EnemySpellRow, EnemySpellSlot, EnemySpellTimer, Mode, SpellReliability } from './types';

export interface EnemyInput {
  championId: number;
  championName: string;
  /** Alias Data Dragon (« MonkeyKing »). */
  alias: string;
  level: number;
  dead: boolean;
  items: number[];
  /** rawDisplayName des sorts d'invocateur (1 puis 2). */
  spells: [string | null, string | null];
  /** Noms affichés des mêmes sorts, pour ceux qu'un augment remplace. */
  spellNames?: [string | null, string | null];
  /** Arbres de runes visibles (principal, secondaire) ; null si l'API ne les donne pas (Mayhem, ARAM parfois). */
  runeTrees: number[] | null;
  /** Accélération d'équilibrage ARAM / Mayhem du champion (`ability_haste`, peut être négative), absente en Faille. */
  balanceHaste?: number;
}

interface Spec {
  name: string;
  icon: string | null;
  base: number | null;
  haste: number;
  hidden: number;
  reliability: SpellReliability;
  detail: string;
  locked: boolean;
}

interface Running {
  readyAt: number;
  haste: number;
}

const SLOTS: EnemySpellSlot[] = ['R', 'D', 'F'];
const s = (x: number) => `${Math.round(x)} s`;

export class EnemySpellTracker {
  private timers = new Map<string, Running>();
  private enemies: EnemyInput[] = [];
  private mode: Mode | null = null;
  private gameTime: number | null = null;
  private clockOffset = 0;

  constructor(
    private data: CooldownData,
    private nowMs: () => number = Date.now,
  ) {}

  reset(): void {
    this.timers.clear();
    this.enemies = [];
    this.gameTime = null;
  }

  get tracking(): number {
    return this.timers.size;
  }

  private spec(e: EnemyInput, slot: EnemySpellSlot): Spec {
    const mayhem = this.mode === 'mayhem';
    const augNote = mayhem ? ' · augments adverses inconnus' : '';
    if (slot === 'R') {
      const ult = this.data.ultimate(e.alias);
      if (!ult) return { name: 'Ultime', icon: null, base: null, haste: 0, hidden: 0, reliability: 'inconnu', detail: 'cooldowns du champion pas encore chargés', locked: false };
      const rank = ultRank(e.level, ult.maxrank);
      const h = this.data.hasteOf(e.items);
      const tuned = e.balanceHaste ?? 0;
      const haste = h.ability + h.ultimate + tuned;
      // Mayhem : runes désactivées (wiki), `runeTrees` à null n'y veut pas dire « rune inconnue ».
      const hidden = mayhem ? 0 : e.runeTrees == null || e.runeTrees.includes(HIDDEN.ultimateHunter.tree) ? HIDDEN.ultimateHunter.ultimate : 0;
      if (!rank) return { name: ult.name, icon: ult.icon, base: null, haste, hidden, reliability: 'calculé', detail: 'pas encore débloqué', locked: true };
      const base = ult.cooldown[Math.min(rank, ult.cooldown.length) - 1] ?? null;
      return {
        name: ult.name,
        icon: ult.icon,
        base,
        haste,
        hidden,
        reliability: base == null ? 'inconnu' : mayhem ? 'approx' : 'calculé',
        detail: `rang ${rank} supposé (niv. ${e.level}) · base ${base == null ? '?' : s(base)} · ${h.ability + h.ultimate} haste des objets${h.ultimate ? ` dont ${h.ultimate} d’ultime` : ''}${tuned ? ` · ${tuned > 0 ? '+' : ''}${tuned} d’équilibrage du mode` : ''}${hidden ? ' · rune cachée possible' : ''}${augNote}`,
        locked: false,
      };
    }
    const index = slot === 'D' ? 0 : 1;
    const raw = e.spells[index];
    if (isAugmentSpell(raw)) return { name: e.spellNames?.[index] || 'Augment', icon: null, base: null, haste: 0, hidden: 0, reliability: 'inconnu', detail: 'sort donné par un de ses augments : cooldown inconnu', locked: false };
    const key = summonerKey(raw ?? undefined);
    if (!key) return { name: '?', icon: null, base: null, haste: 0, hidden: 0, reliability: 'inconnu', detail: 'sort non lu', locked: false };
    const dd = this.data.summoner(key);
    const fb = SUMMONER_FALLBACK[key];
    const name = dd?.name ?? fb?.name ?? key.replace(/^Summoner/, '');
    const base = dd?.cooldown ?? fb?.cooldown ?? null;
    const fromItems = this.data.hasteOf(e.items).summoner;
    const fromMode = this.mode === 'aram' || mayhem ? ARAM_SUMMONER_HASTE : 0;
    const haste = fromItems + fromMode;
    const hidden = mayhem ? 0 : e.runeTrees == null || e.runeTrees.includes(HIDDEN.cosmicInsight.tree) ? HIDDEN.cosmicInsight.summoner : 0;
    const approx = APPROX_SUMMONERS[key] ?? (!dd && fb ? 'valeur de secours, Data Dragon injoignable' : null);
    return {
      name,
      icon: dd?.icon ?? null,
      base,
      haste,
      hidden,
      reliability: base == null ? 'inconnu' : approx || mayhem ? 'approx' : 'calculé',
      detail: `base ${base == null ? '?' : s(base)} · ${fromMode ? `${fromMode} haste d’invocateur du mode · ` : ''}${fromItems} des objets${hidden ? ' · Cosmic Insight possible' : ''}${approx ? ` · ${approx}` : ''}${augNote}`,
      locked: false,
    };
  }

  /** À chaque lecture de l'API Live Client : met à jour niveaux, objets et haste des timers en cours. */
  update(enemies: EnemyInput[], gameTime: number, mode: Mode | null): EnemySpellPanel {
    this.enemies = enemies;
    this.mode = mode;
    this.gameTime = gameTime;
    const offset = this.nowMs() / 1000 - gameTime;
    if (Math.abs(offset - this.clockOffset) > 0.75) this.clockOffset = offset; // pause, lag : on recale

    for (const e of enemies) {
      for (const slot of SLOTS) {
        const k = `${e.championId}:${slot}`;
        const t = this.timers.get(k);
        if (!t) continue;
        if (t.readyAt <= gameTime) {
          this.timers.delete(k); // revenu
          continue;
        }
        const h = this.spec(e, slot).haste;
        if (h !== t.haste) {
          t.readyAt = gameTime + rescale(t.readyAt - gameTime, t.haste, h);
          t.haste = h;
        }
      }
    }
    return this.panel();
  }

  panel(): EnemySpellPanel {
    const gt = this.gameTime ?? 0;
    const rows: EnemySpellRow[] = this.enemies.map((e) => ({
      championId: e.championId,
      championName: e.championName,
      level: e.level,
      dead: e.dead,
      spells: SLOTS.map((slot): EnemySpellTimer => {
        const sp = this.spec(e, slot);
        const t = this.timers.get(`${e.championId}:${slot}`);
        const cooldown = sp.base == null || sp.locked ? null : withHaste(sp.base, sp.haste);
        const readyAt = t ? t.readyAt : null;
        const earliest = t && sp.hidden ? gt + rescale(t.readyAt - gt, sp.haste, sp.haste + sp.hidden) : null;
        return {
          slot,
          name: sp.name,
          icon: sp.icon,
          cooldown: cooldown == null ? null : Math.round(cooldown * 10) / 10,
          readyAt: readyAt == null ? null : Math.round(readyAt * 10) / 10,
          earliest: earliest == null ? null : Math.round(earliest * 10) / 10,
          reliability: sp.reliability,
          detail: sp.detail,
          ...(sp.locked ? { locked: true } : {}),
        };
      }),
    }));
    const missing = !this.data.ready ? `Data Dragon injoignable${this.data.error ? ` (${this.data.error})` : ''} : sorts d'invocateur en valeurs de secours, ultimes inconnus.` : null;
    return { clockOffset: Math.round(this.clockOffset * 100) / 100, enemies: rows, warning: missing };
  }

  /** Tu signales un sort. `gameTime` : relu au moment du clic, pour coller au lancement. */
  mark(championId: number, slot: EnemySpellSlot, action: EnemySpellAction, gameTime: number, delta = 0): { ok: boolean; message: string } {
    const e = this.enemies.find((x) => x.championId === championId);
    if (!e) return { ok: false, message: 'Champion ennemi introuvable dans la partie' };
    const k = `${championId}:${slot}`;
    const sp = this.spec(e, slot);
    this.gameTime = gameTime;
    if (action === 'clear') {
      this.timers.delete(k);
      return { ok: true, message: `${sp.name} de ${e.championName} : timer annulé` };
    }
    if (action === 'shift') {
      const t = this.timers.get(k);
      if (!t) return { ok: false, message: 'Aucun timer en cours à décaler' };
      t.readyAt = Math.max(gameTime, t.readyAt + delta);
      if (t.readyAt <= gameTime) this.timers.delete(k);
      return { ok: true, message: `${sp.name} de ${e.championName} : décalé de ${delta > 0 ? '+' : ''}${delta} s` };
    }
    if (sp.locked) return { ok: false, message: `${e.championName} n’a pas encore son ultime (niv. ${e.level})` };
    if (sp.base == null) return { ok: false, message: `Cooldown de ${sp.name} inconnu : pas de timer plutôt qu’un faux` };
    const readyAt = gameTime + withHaste(sp.base, sp.haste);
    this.timers.set(k, { readyAt, haste: sp.haste });
    return { ok: true, message: `${sp.name} de ${e.championName} : de retour dans ${Math.round(readyAt - gameTime)} s` };
  }
}
