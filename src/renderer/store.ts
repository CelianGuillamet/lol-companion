import { wilson } from '../core/stats';
import { ref } from 'vue';
import type { Api, AppState } from '../core/types';

declare global {
  interface Window {
    api: Api;
    __setTab?: (tab: string) => void;
  }
}

export const state = ref<AppState | null>(null);

/**
 * Ouvert dans un navigateur (téléphone) au lieu d'Electron : pas de window.api → on parle au petit serveur HTTP de
 * l'app, en lecture seule, avec le jeton de l'URL.
 */
function httpApi(): Api {
  const t = new URLSearchParams(location.search).get('t') ?? '';
  const get = async <T,>(path: string): Promise<T> => (await fetch(`${path}${path.includes('?') ? '&' : '?'}t=${encodeURIComponent(t)}`)).json();
  const readOnly = async () => ({ ok: false, message: 'Lecture seule depuis le téléphone' });
  return {
    getState: () => get('/api/state'),
    onState: (cb) => {
      const es = new EventSource(`/api/events?t=${encodeURIComponent(t)}`);
      es.onmessage = (e) => cb(JSON.parse(e.data));
      return () => es.close();
    },
    getHistory: () => get('/api/history'),
    gameDetail: (id) => get(`/api/detail/${id}`),
    championAugments: async () => null,
    championBuild: async () => null,
    listChampions: async () => [],
    laneTier: async () => [],
    currentLane: async () => null,
    championLanes: async () => [],
    balanceChanges: async () => [],
    pickChampion: readOnly,
    applyLoadout: readOnly,
    setSettings: async () => (await get<AppState>('/api/state')).settings,
    refreshData: async () => undefined,
    importHistory: async () => ({ added: 0 }),
    exportHistory: readOnly,
    listDisplays: async () => [],
    testOverlay: readOnly,
    phoneInfo: async () => ({ running: true, url: location.href, error: null }),
    cardReader: async () => ({ permission: 'phone', message: '' }),
  };
}

export async function connectStore(): Promise<void> {
  if (!window.api) window.api = httpApi();
  state.value = await window.api.getState();
  window.api.onState((s) => (state.value = s));
}

export const championIcon = (id: number) =>
  `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${id}.png`;

/** Winrate d'un augment pour le choix n (1 à 4), ou global si inconnu / pas de choix. */
export const wrAt = (a: { winrate: number; rounds?: (number | null)[] }, round: number | null) =>
  (round ? a.rounds?.[round - 1] : null) ?? a.winrate;

export const ROUND_LABEL = ['début', 'niv. 7', 'niv. 11', 'niv. 15'];

export const pct = (x: number | null | undefined, digits = 1) => (x == null ? '—' : `${(x * 100).toFixed(digits).replace('.', ',')} %`);

export const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1).replace('.', ',')}`;

export const PHASE_LABEL: Record<string, string> = {
  None: 'Accueil',
  Lobby: 'Salon',
  Matchmaking: 'Recherche de partie',
  ReadyCheck: 'Partie trouvée',
  ChampSelect: 'Sélection des champions',
  GameStart: 'Lancement',
  InProgress: 'En partie',
  Reconnect: 'Reconnexion',
  WaitingForStats: 'Fin de partie',
  PreEndOfGame: 'Fin de partie',
  EndOfGame: 'Fin de partie',
};

/** Image introuvable (hors ligne…) : on garde le fond de l'icône au lieu de l'icône cassée. */
/**
 * Couleur d'un winrate perso : vert / rouge seulement si l'écart à 50 % tient sur l'échantillon (Wilson à 80 %).
 * 1V 0D reste neutre ; 4V 0D est vert ; 2V 3D est neutre. Évite de lire du bruit comme un signal.
 */
export const tone = (wins: number, games: number): string => {
  if (!games) return '';
  const { lo, hi } = wilson(wins / games, games, 1.2816);
  return lo > 0.5 ? 'good' : hi < 0.5 ? 'bad' : '';
};

/**
 * Fiabilité d'un winrate selon la demi-largeur de son intervalle à 95 % : ≤ 1,5 point = fiable, ≤ 4 points =
 * indicatif, au-delà = échantillon faible.
 */
export const confidenceOf = (winrate: number, games: number) => {
  const { lo, hi } = wilson(winrate, games);
  const half = ((hi - lo) / 2) * 100;
  const level = !games ? 1 : half <= 1.5 ? 3 : half <= 4 ? 2 : 1;
  const label = level === 3 ? 'fiable' : level === 2 ? 'indicatif' : 'échantillon faible';
  const n = games.toLocaleString('fr-FR');
  return { level, label, title: games ? `± ${half.toFixed(1).replace('.', ',')} points (95 %) sur ${n} parties` : 'aucune partie' };
};

export const hideBroken = (e: Event) => ((e.target as HTMLImageElement).style.visibility = 'hidden');
