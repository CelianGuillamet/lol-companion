// Import automatique : runes (page recommandée par le client), sorts et item set (données arammeta).
// La logique des runes reprend celle de queuePop (doughknee/queuePop, MIT) : une seule page gérée, modifiée sur place.

import type { LcuClient } from './lcu';
import type { ChampionDetail } from './arammeta';
import { ARAM_MAP_ID, SPELL } from './modes';

const PAGE_NAME = 'ARAM Companion';
const SET_PREFIX = 'ARAM Companion';

interface RecommendedPage {
  primaryPerkStyleId?: number;
  secondaryPerkStyleId?: number;
  primaryStyleId?: number;
  subStyleId?: number;
  perks?: ({ id: number } | number)[];
  selectedPerkIds?: number[];
  championId?: number;
}

interface PerkPage {
  id: number;
  name: string;
  isEditable?: boolean;
}

export interface RunePage {
  primary: number;
  sub: number;
  perks: number[];
}

/** Page de runes recommandée par le client pour ce champion sur la carte ARAM. */
export async function recommendedPage(lcu: LcuClient, championId: number, mapId = ARAM_MAP_ID, position = 'NONE'): Promise<RunePage | null> {
  const endpoints = [
    `/lol-perks/v1/recommended-pages/champion/${championId}/position/${position}/map/${mapId}`,
    ...(position !== 'NONE' ? [`/lol-perks/v1/recommended-pages/champion/${championId}/position/NONE/map/${mapId}`] : []),
    `/lol-perks/v1/recommended-pages/champion/${championId}/position/UTILITY/map/${mapId}`,
    '/lol-perks/v1/recommended-pages',
  ];
  for (const ep of endpoints) {
    const list = await lcu.get<RecommendedPage[]>(ep);
    if (!Array.isArray(list) || !list.length) continue;
    const page = list.find((p) => p.championId === championId) ?? list[0];
    const primary = page.primaryPerkStyleId ?? page.primaryStyleId;
    const sub = page.secondaryPerkStyleId ?? page.subStyleId;
    const perks = (page.perks ?? page.selectedPerkIds ?? []).map((p) => (typeof p === 'object' ? p.id : p)).filter(Boolean);
    if (primary && sub && perks.length >= 6) return { primary, sub, perks };
  }
  return null;
}

export async function applyRunes(lcu: LcuClient, championId: number, page?: RunePage | null, mapId = ARAM_MAP_ID, position = 'NONE'): Promise<string> {
  const rec = page && page.perks.length === 9 ? page : await recommendedPage(lcu, championId, mapId, position);
  if (!rec) throw new Error('le client ne propose pas de runes recommandées pour ce champion');
  const { primary, sub, perks } = rec;

  const body = { name: PAGE_NAME, primaryStyleId: primary, subStyleId: sub, selectedPerkIds: perks, current: true };
  const pages = (await lcu.get<PerkPage[]>('/lol-perks/v1/pages')) ?? [];
  const mine = pages.find((p) => p.name === PAGE_NAME);
  let id: number | null = mine?.id ?? null;
  if (id != null) {
    const r = await lcu.request('PUT', `/lol-perks/v1/pages/${id}`, body);
    if (r.status >= 400) throw new Error(`modification de la page refusée (HTTP ${r.status})`);
  } else {
    const r = await lcu.request<{ id: number }>('POST', '/lol-perks/v1/pages', body);
    if (r.status >= 400) throw new Error('pages de runes pleines : supprime-en une ou renomme-en une « ARAM Companion »');
    id = r.data?.id ?? null;
  }
  if (id != null) await lcu.request('PUT', '/lol-perks/v1/currentpage', id);
  return page && rec === page ? 'runes OP.GG importées' : 'runes importées';
}

export function bestSpells(detail: ChampionDetail | null): [number, number] {
  const slug = detail?.spells?.top?.[0]?.slug;
  const ids = slug ? slug.split('+').map(Number).filter((n) => n > 0) : [];
  return ids.length === 2 ? [ids[0], ids[1]] : [SPELL.flash, SPELL.mark];
}

export async function applySpells(lcu: LcuClient, spells: [number, number]): Promise<string> {
  const cur = await lcu.get<{ spell1Id?: number; spell2Id?: number }>('/lol-champ-select/v1/session/my-selection');
  let [s1, s2] = spells;
  // Garde l'emplacement habituel de tes sorts (ex. Flash sur F) si un sort est déjà en place.
  if (cur && (cur.spell2Id === s1 || cur.spell1Id === s2)) [s1, s2] = [s2, s1];
  const r = await lcu.request('PATCH', '/lol-champ-select/v1/session/my-selection', { spell1Id: s1, spell2Id: s2 });
  if (r.status >= 400) throw new Error(`sorts refusés (HTTP ${r.status})`);
  return 'sorts importés';
}

interface ItemSets {
  accountId?: number;
  timestamp?: number;
  itemSets: Record<string, unknown>[];
}

export async function applyItemSet(lcu: LcuClient, championId: number, championName: string, detail: ChampionDetail | null): Promise<string> {
  const core = (detail?.singleItems?.top ?? []).slice(0, 6);
  const boots = (detail?.boots?.top ?? []).slice(0, 2);
  if (!core.length) throw new Error('pas de données d’items pour ce champion');
  const summoner = await lcu.get<{ summonerId: number }>('/lol-summoner/v1/current-summoner');
  if (!summoner?.summonerId) throw new Error('invocateur introuvable');
  const path = `/lol-item-sets/v1/item-sets/${summoner.summonerId}/sets`;
  const current = await lcu.get<ItemSets>(path);
  // Sécurité : on ne réécrit jamais les sets si la lecture a échoué (sinon on effacerait les tiens).
  if (!current || !Array.isArray(current.itemSets)) throw new Error('lecture des item sets impossible');

  const toItems = (rows: { slug: string }[]) =>
    rows.flatMap((r) => r.slug.split('+')).filter((id) => /^\d+$/.test(id)).map((id) => ({ id, count: 1 }));
  const set = {
    uid: `aram-companion-${championId}`,
    title: `${SET_PREFIX} – ${championName}`,
    mode: 'any',
    map: 'any',
    type: 'custom',
    sortrank: 0,
    startedFrom: 'blank',
    associatedChampions: [championId],
    associatedMaps: [ARAM_MAP_ID],
    preferredItemSlots: [],
    blocks: [
      { type: 'Items les plus gagnants (arammeta)', items: toItems(core), hideIfSummonerSpell: '', showIfSummonerSpell: '' },
      { type: 'Bottes', items: toItems(boots), hideIfSummonerSpell: '', showIfSummonerSpell: '' },
    ],
  };
  const others = current.itemSets.filter((s) => !String(s.title ?? '').startsWith(SET_PREFIX));
  const r = await lcu.request('PUT', path, { ...current, itemSets: [...others, set] });
  if (r.status >= 400) throw new Error(`item set refusé (HTTP ${r.status})`);
  return 'item set créé';
}
