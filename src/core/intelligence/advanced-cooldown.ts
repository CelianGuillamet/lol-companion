/**
 * Calcul pur. Aucune table de patch implicite : une règle vérifiée et toutes ses
 * entrées sont nécessaires. Un calcul n'est jamais une observation du serveur.
 */
export type CooldownCategory = 'ability' | 'ultimate' | 'summoner';
export type CooldownForm = 'standard' | 'charge' | 'recast';
export type CooldownActivation = 'cast' | 'charge-spent' | 'recast-finished';

export interface CooldownModifier {
  /** Appliqué après l'accélération, dans l'ordre fourni (ordre documenté par la règle). */
  kind: 'flat' | 'multiply';
  value: number;
}

export interface CooldownInput {
  patch: string;
  mode: string;
  champion: string;
  spell: string;
  rank: number | null;
  abilityHaste: number | null;
  ultimateHaste: number | null;
  summonerHaste: number | null;
  /** Vrai seulement si objets, runes et modificateurs conditionnels ont été acquis. */
  modifiersComplete: boolean;
  modifiers: readonly CooldownModifier[];
  form?: CooldownForm;
  activation?: CooldownActivation;
}

export interface CooldownRule {
  patch: string;
  mode: string;
  champion: string;
  spell: string;
  category: CooldownCategory;
  baseCooldowns: readonly number[];
  form: CooldownForm;
  /** Une charge lance sa recharge ; une réactivation peut différer le départ. */
  startsOn: CooldownActivation;
  source: string;
  /** Refuser les états particuliers que la formule standard ne couvre pas. */
  validate?: (input: CooldownInput) => string | null;
}

export type CooldownCalculation =
  | { quality: 'calculated'; durationSeconds: number; ruleSource: string; form: CooldownForm }
  | { quality: 'unknown'; reasons: string[] };

const key = (r: Pick<CooldownRule, 'patch' | 'mode' | 'champion' | 'spell'>) =>
  JSON.stringify([r.patch, r.mode, r.champion, r.spell]);
const validHaste = (value: number | null): value is number => value !== null && Number.isFinite(value) && value >= 0;
const unknown = (...reasons: string[]): CooldownCalculation => ({ quality: 'unknown', reasons });

export class AdvancedCooldownEngine {
  private readonly rules = new Map<string, CooldownRule>();

  /** L'appelant possède la provenance et la validation du patch de chaque règle. */
  register(rule: CooldownRule): void {
    if (![rule.patch, rule.mode, rule.champion, rule.spell, rule.source].every((s) => s.trim()) ||
      !rule.baseCooldowns.length || rule.baseCooldowns.some((n) => !Number.isFinite(n) || n <= 0)) {
      throw new Error('Règle de cooldown invalide');
    }
    if ((rule.form === 'charge' && rule.startsOn !== 'charge-spent') ||
      (rule.form === 'standard' && rule.startsOn !== 'cast')) {
      throw new Error('Départ de cooldown incompatible avec la règle');
    }
    this.rules.set(key(rule), { ...rule, baseCooldowns: [...rule.baseCooldowns] });
  }

  calculate(input: CooldownInput): CooldownCalculation {
    const rule = this.rules.get(key(input));
    if (!rule) return unknown('Aucune règle vérifiée pour ce patch, mode, champion et sort');
    if ((input.form ?? 'standard') !== rule.form || (input.activation ?? 'cast') !== rule.startsOn) {
      return unknown('Activation ou mécanique du sort non couverte par la règle');
    }
    if (input.rank === null || !Number.isInteger(input.rank) || input.rank < 1 || input.rank > rule.baseCooldowns.length) {
      return unknown('Rang du sort inconnu ou invalide');
    }
    if (!input.modifiersComplete) return unknown('Modificateurs conditionnels incomplets');
    const reason = rule.validate?.(input);
    if (reason) return unknown(reason);
    let haste: number;
    if (rule.category === 'summoner') {
      if (!validHaste(input.summonerHaste)) return unknown('Accélération des sorts d’invocateur inconnue');
      haste = input.summonerHaste;
    } else {
      if (!validHaste(input.abilityHaste)) return unknown('Accélération de compétence inconnue');
      haste = input.abilityHaste;
      if (rule.category === 'ultimate') {
        if (!validHaste(input.ultimateHaste)) return unknown('Accélération ultime inconnue');
        haste += input.ultimateHaste;
      }
    }
    if (!Number.isFinite(haste)) return unknown('Somme d’accélération invalide');
    let seconds = rule.baseCooldowns[input.rank - 1] / (1 + haste / 100);
    for (const modifier of input.modifiers) {
      if (!Number.isFinite(modifier.value) || modifier.value < 0) return unknown('Modificateur invalide');
      if (modifier.kind === 'flat') seconds = Math.max(0, seconds - modifier.value);
      else if (modifier.kind === 'multiply') seconds *= modifier.value;
      else return unknown('Type de modificateur inconnu');
    }
    if (!Number.isFinite(seconds)) return unknown('Résultat de cooldown invalide');
    return { quality: 'calculated', durationSeconds: seconds, ruleSource: rule.source, form: rule.form };
  }
}

/** Horloge de partie en secondes, jamais Date.now(). Pas d'extrapolation de pause. */
export interface CooldownTimer {
  quality: 'calculated';
  startedAt: number;
  readyAt: number;
  updatedAt: number;
}

export function createCooldownTimer(calculation: CooldownCalculation, castAt: number): CooldownTimer | null {
  if (calculation.quality !== 'calculated' || !Number.isFinite(castAt) || castAt < 0 ||
    !Number.isFinite(calculation.durationSeconds) || calculation.durationSeconds < 0 ||
    !Number.isFinite(castAt + calculation.durationSeconds)) return null;
  return { quality: 'calculated', startedAt: castAt, readyAt: castAt + calculation.durationSeconds, updatedAt: castAt };
}

export function remainingCooldown(timer: CooldownTimer, gameTime: number): number | null {
  if (!Number.isFinite(gameTime) || gameTime < timer.updatedAt) return null;
  return Math.max(0, timer.readyAt - gameTime);
}

export type CooldownChange =
  | { kind: 'reset'; at: number }
  | { kind: 'reduce-seconds' | 'reduce-fraction'; at: number; amount: number };

/** Ne reçoit que des changements acquis ; ne déduit jamais un reset d'un kill. */
export function applyCooldownChange(timer: CooldownTimer, change: CooldownChange): CooldownTimer | null {
  const remaining = remainingCooldown(timer, change.at);
  if (remaining === null) return null;
  if (change.kind === 'reset') return { ...timer, readyAt: change.at, updatedAt: change.at };
  if (!Number.isFinite(change.amount) || change.amount < 0 ||
    (change.kind === 'reduce-fraction' && change.amount > 1)) return null;
  const next = change.kind === 'reduce-seconds' ? Math.max(0, remaining - change.amount) : remaining * (1 - change.amount);
  return { ...timer, readyAt: change.at + next, updatedAt: change.at };
}

/** Charges à récupération séquentielle ; état initial observé obligatoire. */
export interface ChargePool {
  available: number;
  maximum: number;
  rechargeSeconds: number;
  nextChargeAt: number | null;
  updatedAt: number;
}

export function advanceCharges(pool: ChargePool, at: number): ChargePool | null {
  if (!Number.isFinite(at) || at < 0 || !Number.isFinite(pool.updatedAt) || pool.updatedAt < 0 ||
    at < pool.updatedAt || !Number.isSafeInteger(pool.maximum) || pool.maximum < 1 ||
    !Number.isSafeInteger(pool.available) || pool.available < 0 || pool.available > pool.maximum ||
    !Number.isFinite(pool.rechargeSeconds) || pool.rechargeSeconds <= 0 ||
    (pool.available < pool.maximum && (pool.nextChargeAt === null || !Number.isFinite(pool.nextChargeAt) || pool.nextChargeAt < 0)) ||
    (pool.available === pool.maximum && pool.nextChargeAt !== null)) return null;
  let available = pool.available;
  let next = pool.nextChargeAt;
  if (next !== null && at >= next) {
    const recovered = Math.min(pool.maximum - available, 1 + Math.floor((at - next) / pool.rechargeSeconds));
    available += recovered;
    next = available === pool.maximum ? null : next + recovered * pool.rechargeSeconds;
  }
  return { ...pool, available, nextChargeAt: next, updatedAt: at };
}

export function spendCharge(pool: ChargePool, at: number): ChargePool | null {
  const current = advanceCharges(pool, at);
  if (!current || current.available === 0) return null;
  return { ...current, available: current.available - 1, nextChargeAt: current.nextChargeAt ?? at + current.rechargeSeconds };
}
