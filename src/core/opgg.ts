// Données Faille de l'invocateur (et autres modes) : serveur MCP public d'OP.GG (https://mcp-api.op.gg/mcp, transport
// « Streamable HTTP », JSON-RPC 2.0, sans clé). Statistiques agrégées par champion et par rôle (builds, runes,
// contres) — ce qu'arammeta est pour l'ARAM.
//
// Le schéma exact des outils n'est pas documenté publiquement : on le lit au démarrage (tools/list), on construit
// les arguments d'après ce schéma, et on garde une copie brute des réponses dans probe-output/ pour vérifier.

import https from 'node:https';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ENDPOINT = 'https://mcp-api.op.gg/mcp';
const MAX_AGE_MS = 6 * 3600 * 1000;

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: { properties?: Record<string, { type?: string; enum?: string[]; description?: string; items?: unknown }>; required?: string[] };
}

type Post = (body: object, headers: Record<string, string>) => Promise<{ status: number; headers: Record<string, string>; text: string }>;

function post(body: object, headers: Record<string, string>): ReturnType<Post> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      ENDPOINT,
      {
        method: 'POST',
        timeout: 30000,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Content-Length': Buffer.byteLength(data), 'User-Agent': 'aram-companion (usage perso)', ...headers },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (text += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k.toLowerCase(), String(v)])), text }));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('délai dépassé')));
    req.end(data);
  });
}

/** Réponse JSON-RPC, envoyée en JSON simple ou en flux SSE (lignes « data: … »). */
export function parseRpc(text: string): { result?: unknown; error?: { message?: string } } | null {
  const t = text.trim();
  if (t.startsWith('{')) return JSON.parse(t);
  const datas = t
    .split(/\r?\n/)
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
    .filter(Boolean);
  for (const d of datas.reverse()) {
    try {
      const j = JSON.parse(d);
      if (j && (j.result !== undefined || j.error)) return j;
    } catch {
      /* ligne suivante */
    }
  }
  return null;
}

/** Texte d'un résultat d'outil MCP (content[].text), parsé en JSON quand c'est du JSON. */
export function toolPayload(result: unknown): unknown {
  const r = result as { content?: { type?: string; text?: string }[]; structuredContent?: unknown } | null;
  if (r?.structuredContent) return r.structuredContent;
  const text = (r?.content ?? []).filter((c) => c.type === 'text' && c.text).map((c) => c.text).join('\n');
  if (!text) return r;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class OpggClient {
  private session: string | null = null;
  private id = 1;
  tools: McpTool[] = [];
  lastError: string | null = null;

  constructor(
    private cacheDir: string,
    private probeDir: string | null = null,
    private send: Post = post,
  ) {}

  private async rpc(method: string, params?: object): Promise<unknown> {
    const headers: Record<string, string> = this.session ? { 'Mcp-Session-Id': this.session } : {};
    const r = await this.send({ jsonrpc: '2.0', id: this.id++, method, ...(params ? { params } : {}) }, headers);
    const sid = r.headers['mcp-session-id'];
    if (sid) this.session = sid;
    if (r.status >= 400) throw new Error(`HTTP ${r.status} ${r.text.slice(0, 160)}`);
    const j = parseRpc(r.text);
    if (!j) throw new Error(`réponse illisible : ${r.text.slice(0, 160)}`);
    if (j.error) throw new Error(j.error.message ?? 'erreur MCP');
    return j.result;
  }

  async connect(): Promise<boolean> {
    try {
      await this.rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'aram-companion', version: '1.52' } });
      try {
        await this.send({ jsonrpc: '2.0', method: 'notifications/initialized' }, this.session ? { 'Mcp-Session-Id': this.session } : {});
      } catch {
        /* facultatif */
      }
      const list = (await this.rpc('tools/list')) as { tools?: McpTool[] };
      this.tools = list.tools ?? [];
      await this.dump('opgg-tools.json', this.tools);
      this.lastError = null;
      return this.tools.length > 0;
    } catch (e) {
      this.lastError = (e as Error).message;
      return false;
    }
  }

  tool(name: string): McpTool | undefined {
    return this.tools.find((t) => t.name === name);
  }

  /** Appel d'outil, avec cache disque (6 h) par nom + arguments. */
  async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const key = `opgg-${name}-${Object.values(args).filter((v) => typeof v === 'string').join('-')}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
    const file = join(this.cacheDir, `${key}.json`);
    try {
      const s = await stat(file);
      if (Date.now() - s.mtimeMs < MAX_AGE_MS) return JSON.parse(await readFile(file, 'utf8'));
    } catch {
      /* pas en cache */
    }
    if (!this.tools.length && !(await this.connect())) throw new Error(this.lastError ?? 'OP.GG injoignable');
    let result: unknown;
    try {
      result = await this.rpc('tools/call', { name, arguments: args });
    } catch (e) {
      // Session expirée : on se reconnecte une fois
      this.session = null;
      if (!(await this.connect())) throw e;
      result = await this.rpc('tools/call', { name, arguments: args });
    }
    const payload = toolPayload(result);
    try {
      await mkdir(this.cacheDir, { recursive: true });
      await writeFile(file, JSON.stringify(payload));
    } catch {
      /* cache facultatif */
    }
    return payload;
  }

  /** Copie de diagnostic dans probe-output/ (pour construire / vérifier la lecture des réponses). */
  async dump(name: string, data: unknown): Promise<void> {
    if (!this.probeDir) return;
    try {
      await mkdir(this.probeDir, { recursive: true });
      await writeFile(join(this.probeDir, name), typeof data === 'string' ? data : JSON.stringify(data, null, 1));
    } catch {
      /* diagnostic seulement */
    }
  }
}

/**
 * Arguments d'un outil d'après son schéma : on remplit les propriétés connues (champion, position, mode, langue,
 * champs voulus) avec la valeur la plus proche parmi celles autorisées (enum).
 */
export function buildArgs(tool: McpTool | undefined, want: { champion: string; position?: string; mode?: string; lang?: string }): Record<string, unknown> {
  const props = tool?.inputSchema?.properties ?? {};
  const out: Record<string, unknown> = {};
  const pick = (enumVals: string[] | undefined, value: string | undefined) => {
    if (!value) return enumVals?.[0];
    if (!enumVals?.length) return value;
    const v = value.toLowerCase();
    return enumVals.find((e) => e.toLowerCase() === v) ?? enumVals.find((e) => e.toLowerCase().includes(v) || v.includes(e.toLowerCase())) ?? enumVals[0];
  };
  for (const [k, p] of Object.entries(props)) {
    const key = k.toLowerCase();
    if (key.includes('champion')) out[k] = pick(p.enum, want.champion);
    else if (key.includes('position') || key === 'lane' || key === 'role') out[k] = pick(p.enum, want.position);
    else if (key.includes('mode') || key.includes('queue')) out[k] = pick(p.enum, want.mode);
    else if (key === 'lang' || key.includes('locale') || key.includes('language')) out[k] = pick(p.enum, want.lang ?? 'en_US');
    else if (key.includes('desired_output_fields')) out[k] = ['data'];
  }
  return out;
}

// ---------------------------------------------------------------- format compact des réponses OP.GG
//
// Les outils répondent en texte compact : des lignes « class Nom: champ1,champ2 » puis une expression
// Nom(valeur1, valeur2, [liste], "texte", …). On la relit en objets JS en nommant les valeurs d'après les classes.

export function parseCompact(text: string): unknown {
  const classes = new Map<string, string[]>();
  const lines = text.split('\n');
  let i = 0;
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^class (\w+):\s*(.*)$/);
    if (!m) break;
    classes.set(m[1], m[2].split(',').map((s) => s.trim()).filter(Boolean));
  }
  const src = lines.slice(i).join('\n').trim();
  let p = 0;
  const ws = () => {
    while (p < src.length && /\s/.test(src[p])) p++;
  };
  const value = (): unknown => {
    ws();
    const c = src[p];
    if (c === '"') {
      let s = '';
      p++;
      while (p < src.length && src[p] !== '"') {
        if (src[p] === '\\') {
          s += src[p + 1];
          p += 2;
        } else s += src[p++];
      }
      p++;
      return s;
    }
    if (c === '[') {
      p++;
      const arr: unknown[] = [];
      ws();
      if (src[p] === ']') {
        p++;
        return arr;
      }
      for (;;) {
        arr.push(value());
        ws();
        if (src[p] === ',') {
          p++;
          continue;
        }
        if (src[p] === ']') {
          p++;
          break;
        }
        throw new Error(`liste mal formée à ${p}`);
      }
      return arr;
    }
    const tok = src.slice(p).match(/^-?[\d.]+(e-?\d+)?|^[A-Za-z_]\w*/);
    if (!tok) throw new Error(`valeur illisible à ${p} : ${src.slice(p, p + 20)}`);
    const t = tok[0];
    p += t.length;
    if (/^-?[\d.]/.test(t)) return Number(t);
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (t === 'null' || t === 'None') return null;
    ws();
    if (src[p] === '(') {
      p++;
      const args: unknown[] = [];
      ws();
      if (src[p] !== ')') {
        for (;;) {
          args.push(value());
          ws();
          if (src[p] === ',') {
            p++;
            continue;
          }
          if (src[p] === ')') break;
          throw new Error(`arguments mal formés à ${p}`);
        }
      }
      p++;
      const names = classes.get(t);
      if (!names) return { _class: t, _args: args };
      const o: Record<string, unknown> = {};
      names.forEach((n, k) => (o[n] = args[k]));
      return o;
    }
    return t;
  };
  return value();
}

export interface ItemStat {
  ids: number[];
  /** Noms anglais d'OP.GG (ids_names), dans l'ordre des ids. */
  names?: string[];
  games: number;
  winrate: number;
  pick: number;
}

export interface CounterStat {
  id: number;
  name: string;
  games: number;
  /** Ton winrate (champion analysé) contre lui. */
  myWinRate: number;
}

/** Ce qu'on garde d'une analyse OP.GG (champion × rôle × mode). */
export interface OpggAnalysis {
  championId: number;
  position: string | null;
  games: number;
  winRate: number;
  tier: number | null; // 1 = OP … 5 = faible
  damageType: string | null; // AD / AP / BOTH
  /** Champions que tu bats (strong_counters) et qui te battent (weak_counters). */
  beats: CounterStat[];
  losesTo: CounterStat[];
  core: ItemStat | null;
  boots: ItemStat | null;
  starter: ItemStat | null;
  fourth: ItemStat[];
  fifth: ItemStat[];
  sixth: ItemStat[];
  spells: number[];
  runes: { primary: number; sub: number; perks: number[]; winrate: number; games: number; names?: string[]; primaryName?: string; subName?: string } | null;
  skillOrder: string[]; // ordre complet, ex. W Q E Q Q R …
  skillMax: string[]; // priorité de montée, ex. Q W E
  /** Positions jouées (MID, TOP…) triées par parties : sert à deviner le rôle d'un ennemi. */
  positions: { name: string; games: number }[];
}

const num = (x: unknown) => (typeof x === 'number' ? x : Number(x) || 0);
const asItem = (x: unknown): ItemStat | null => {
  const o = x as { ids?: unknown[]; ids_names?: unknown[]; play?: number; win?: number; pick_rate?: number } | null;
  if (!o || !Array.isArray(o.ids) || !o.ids.length) return null;
  const games = num(o.play);
  return { ids: o.ids.map(num).filter((n) => n > 0), ...(Array.isArray(o.ids_names) ? { names: o.ids_names.map(String) } : {}), games, winrate: games ? num(o.win) / games : 0, pick: num(o.pick_rate) };
};
const asItems = (x: unknown): ItemStat[] => (Array.isArray(x) ? x.map(asItem).filter((i): i is ItemStat => !!i) : []);

/** Lit la réponse de lol_get_champion_analysis (texte compact ou JSON). */
export function readAnalysis(payload: unknown, position: string | null): OpggAnalysis | null {
  let root = payload;
  if (typeof root === 'string') {
    try {
      root = parseCompact(root);
    } catch {
      return null;
    }
  }
  const d = (root as { data?: Record<string, unknown> } | null)?.data;
  if (!d) return null;
  const summary = d.summary as { id?: number; average_stats?: { play?: number; win_rate?: number; tier?: number }; positions?: { name?: string; stats?: { play?: number; win_rate?: number; tier_data?: { tier?: number } } }[] } | undefined;
  const pos = summary?.positions ?? [];
  const mine = position ? pos.find((x) => x.name?.toLowerCase() === position.toLowerCase().replace('adc', 'adc')) : undefined;
  const counters = (x: unknown, mineIsWin: boolean): CounterStat[] =>
    (Array.isArray(x) ? x : []).map((c: Record<string, unknown>) => ({
      id: num(c.champion_id),
      name: String(c.champion_name ?? ''),
      games: num(c.play),
      myWinRate: num(c.my_win_rate) || (mineIsWin ? num(c.win_rate) : 1 - num(c.win_rate)),
    }));
  const r = d.runes as Record<string, unknown> | undefined;
  const runes =
    r && Array.isArray(r.primary_rune_ids) && Array.isArray(r.secondary_rune_ids)
      ? {
          primary: num(r.primary_page_id),
          sub: num(r.secondary_page_id),
          perks: [...(r.primary_rune_ids as unknown[]), ...(r.secondary_rune_ids as unknown[]), ...((r.stat_mod_ids as unknown[]) ?? [])].map(num),
          winrate: num(r.play) ? num(r.win) / num(r.play) : 0,
          games: num(r.play),
          // Noms anglais d'OP.GG : affichés quand le client est fermé (sans lui, pas de noms de runes)
          names: [...((r.primary_rune_names as unknown[]) ?? []), ...((r.secondary_rune_names as unknown[]) ?? []), ...((r.stat_mod_names as unknown[]) ?? [])].map(String),
          primaryName: r.primary_page_name ? String(r.primary_page_name) : undefined,
          subName: r.secondary_page_name ? String(r.secondary_page_name) : undefined,
        }
      : null;
  const spells = (d.summoner_spells as { ids?: unknown[] } | undefined)?.ids?.map(num).filter((n) => n > 0) ?? [];
  const skills = d.skills as { order?: string[] } | undefined;
  const mast = d.skill_masteries as { ids?: string[] } | undefined;
  return {
    championId: num(summary?.id),
    position,
    games: num(mine?.stats?.play ?? summary?.average_stats?.play),
    winRate: num(mine?.stats?.win_rate ?? summary?.average_stats?.win_rate),
    tier: (mine?.stats?.tier_data?.tier ?? summary?.average_stats?.tier) ?? null,
    damageType: typeof d.damage_type === 'string' ? d.damage_type : null,
    beats: counters(d.strong_counters, true),
    losesTo: counters(d.weak_counters, false),
    core: asItem(d.core_items),
    boots: asItem(d.boots),
    starter: asItem(d.starter_items),
    fourth: asItems(d.fourth_items),
    fifth: asItems(d.fifth_items),
    sixth: asItems(d.sixth_items),
    spells,
    runes,
    skillOrder: Array.isArray(skills?.order) ? skills!.order : [],
    skillMax: Array.isArray(mast?.ids) ? mast!.ids : [],
    positions: pos.map((x) => ({ name: String(x.name ?? ''), games: num(x.stats?.play) })).sort((a, b) => b.games - a.games),
  };
}

/** Champs demandés à lol_get_champion_analysis (liste fermée imposée par le serveur). */
export const ANALYSIS_FIELDS = [
  'data.summary.{id,is_rip,is_rotation,roles}',
  'data.summary.average_stats.{ban_rate,kda,pick_rate,play,rank,tier,win_rate}',
  'data.summary.positions[].name',
  'data.summary.positions[].stats.{ban_rate,kda,pick_rate,play,role_rate,win_rate}',
  'data.summary.positions[].stats.tier_data.{rank,rank_prev,rank_prev_patch,tier}',
  'data.damage_type',
  'data.strong_counters[].{champion_id,champion_name,counter_win_rate,my_win_rate,play,win,win_rate}',
  'data.weak_counters[].{champion_id,champion_name,counter_win_rate,my_win_rate,play,win,win_rate}',
  'data.core_items.{ids[],ids_names[],pick_rate,play,win}',
  'data.boots.{ids[],ids_names[],pick_rate,play,win}',
  'data.starter_items.{ids[],ids_names[],pick_rate,play,win}',
  'data.fourth_items[].{ids[],ids_names[],pick_rate,play,win}',
  'data.fifth_items[].{ids[],ids_names[],pick_rate,play,win}',
  'data.sixth_items[].{ids[],ids_names[],pick_rate,play,win}',
  'data.summoner_spells.{ids[],ids_names[],pick_rate,play,win}',
  'data.runes.{id,pick_rate,play,primary_page_id,primary_page_name,primary_rune_ids[],primary_rune_names[],secondary_page_id,secondary_page_name,secondary_rune_ids[],secondary_rune_names[],stat_mod_ids[],stat_mod_names[],win}',
  'data.skills.{order[],pick_rate,play,win}',
  'data.skill_masteries.{ids[],pick_rate,play,win}',
];

/** Noms possibles d'un champion pour OP.GG (UPPER_SNAKE_CASE) : « Miss Fortune » → MISS_FORTUNE, puis MISSFORTUNE. */
export function opggNames(name: string, alias?: string): string[] {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const snake = base.replace(/['’.]/g, '').replace(/&/g, ' ').trim().replace(/\s+/g, '_').toUpperCase();
  const flat = base.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return [...new Set([snake, flat, ...(alias ? [alias.toUpperCase(), alias.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()] : [])])].filter(Boolean);
}

export type OpggMode = 'ranked' | 'flex' | 'urf' | 'aram';
export type Lane = 'top' | 'jungle' | 'mid' | 'adc' | 'support';

/** Rôle du client (assignedPosition / position en partie) → rôle OP.GG. */
export function laneOf(pos: string | null | undefined): Lane | null {
  const p = String(pos ?? '').toLowerCase();
  if (p === 'top') return 'top';
  if (p === 'jungle') return 'jungle';
  if (p === 'middle' || p === 'mid') return 'mid';
  if (p === 'bottom' || p === 'adc' || p === 'bot') return 'adc';
  if (p === 'utility' || p === 'support') return 'support';
  return null;
}

export const LANE_LABEL: Record<Lane, string> = { top: 'haut', jungle: 'jungle', mid: 'milieu', adc: 'tireur', support: 'support' };

export interface LaneMetaRow {
  /** Nom du champion tel qu'OP.GG l'écrit (anglais). */
  champion: string;
  lane: Lane;
  roleRate: number;
  winRate: number;
  tier: number | null;
  games: number;
}

const normChamp = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export class OpggData {
  private nameOk = new Map<string, string>(); // nom affiché → nom accepté par OP.GG
  private meta: Map<string, LaneMetaRow[]> | null = null;
  private metaAt = 0;

  constructor(private client: OpggClient) {}

  /** Analyse d'un champion pour un rôle (essaie les variantes de nom ; la bonne est retenue). */
  async analysis(name: string, alias: string | undefined, lane: Lane, mode: OpggMode): Promise<OpggAnalysis | null> {
    // Appel vérifié en vrai (probe du 28 oct.) : nom anglais tel quel et desired_output_fields ["data"].
    const tries = this.nameOk.has(name) ? [this.nameOk.get(name)!] : [...new Set([name, ...opggNames(name, alias)])];
    for (const champion of tries) {
      try {
        const r = await this.client.call('lol_get_champion_analysis', { champion, position: lane, game_mode: mode, lang: 'en_US', desired_output_fields: ['data'] });
        const a = readAnalysis(r, lane);
        if (a && (a.core || a.runes || a.games)) {
          this.nameOk.set(name, champion);
          return a;
        }
      } catch {
        /* variante suivante */
      }
    }
    return null;
  }

  /** Rôles joués par champion sur le patch (pour deviner le rôle d'un ennemi), cache 6 h. */
  async laneMeta(): Promise<Map<string, LaneMetaRow[]>> {
    if (this.meta && Date.now() - this.metaAt < 6 * 3600 * 1000) return this.meta;
    const lanes: Lane[] = ['top', 'jungle', 'mid', 'adc', 'support'];
    const map = new Map<string, LaneMetaRow[]>();
    // Champs précis d'abord ; si le serveur les refuse, la réponse complète (format non encore vu en vrai)
    for (const fields of [lanes.map((l) => `data.positions.${l}[].{champion,play,role_rate,tier,win_rate}`), ['data']]) {
      try {
        const r = await this.client.call('lol_list_lane_meta_champions', { position: 'all', lang: 'en_US', desired_output_fields: fields });
        const root = (typeof r === 'string' ? parseCompact(r) : r) as { data?: { positions?: Record<string, Record<string, unknown>[]> } };
        for (const l of lanes)
          for (const row of root?.data?.positions?.[l] ?? []) {
            const k = normChamp(String(row.champion ?? ''));
            if (!k) continue;
            const list = map.get(k) ?? [];
            list.push({ champion: String(row.champion), lane: l, roleRate: num(row.role_rate), winRate: num(row.win_rate), tier: row.tier == null ? null : num(row.tier), games: num(row.play) });
            map.set(k, list);
          }
      } catch {
        /* essai suivant */
      }
      if (map.size) break;
    }
    if (map.size) {
      this.meta = map;
      this.metaAt = Date.now();
    }
    return map;
  }

  /** Rôle principal d'un champion (quand le client ne donne pas le tien : partie aveugle, sans rôles). */
  async mainLane(name: string): Promise<Lane | null> {
    const rows = (await this.laneMeta()).get(normChamp(name)) ?? [];
    return [...rows].sort((a, b) => b.roleRate - a.roleRate)[0]?.lane ?? null;
  }

  /** Rôle le plus probable de chaque ennemi (attribution gloutonne par taux de jeu dans le rôle, un rôle par joueur). */
  async guessLanes(enemies: { id: number; name: string }[]): Promise<Map<number, Lane>> {
    const meta = await this.laneMeta();
    const pairs: { id: number; lane: Lane; rate: number }[] = [];
    for (const e of enemies) for (const r of meta.get(normChamp(e.name)) ?? []) pairs.push({ id: e.id, lane: r.lane, rate: r.roleRate });
    pairs.sort((a, b) => b.rate - a.rate);
    const out = new Map<number, Lane>();
    const used = new Set<Lane>();
    for (const p of pairs) {
      if (out.has(p.id) || used.has(p.lane)) continue;
      out.set(p.id, p.lane);
      used.add(p.lane);
    }
    return out;
  }
}

/** Ton winrate contre un adversaire : dans ton analyse, sinon déduit de la sienne (1 − son winrate contre toi). */
export function matchupFrom(mine: OpggAnalysis | null, theirs: OpggAnalysis | null, myId: number, oppId: number): { myWinRate: number; games: number } | null {
  const direct = [...(mine?.beats ?? []), ...(mine?.losesTo ?? [])].find((c) => c.id === oppId);
  if (direct && direct.games > 0) return { myWinRate: direct.myWinRate, games: direct.games };
  const back = [...(theirs?.beats ?? []), ...(theirs?.losesTo ?? [])].find((c) => c.id === myId);
  if (back && back.games > 0) return { myWinRate: 1 - back.myWinRate, games: back.games };
  return null;
}

/**
 * Counter-picks contre un champion : ceux contre qui il perd, gardés seulement si la borne basse de l'intervalle à
 * 95 % dépasse 50 % (un « counter » à 54 % sur 80 parties n'en est pas un).
 */
export function counterPicksFrom(theirs: OpggAnalysis | null, wilsonLo: (wr: number, n: number) => number, max = 4): { id: number; name: string; winRate: number; games: number; lo: number }[] {
  return (theirs?.losesTo ?? [])
    .map((c) => ({ id: c.id, name: c.name, winRate: 1 - c.myWinRate, games: c.games }))
    .map((c) => ({ ...c, lo: wilsonLo(c.winRate, c.games) }))
    .filter((c) => c.id > 0 && c.lo > 0.5)
    .sort((a, b) => b.lo - a.lo)
    .slice(0, max);
}
