// Faux client League (LCU) en HTTPS, pour tester l'app sans League.
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

export interface MockState {
  /** Catalogue facultatif pour les scénarios de recettes synthétiques. */
  itemData?: unknown[];
  phase: string;
  queue: { id: number; gameMode: string };
  session: Record<string, unknown> | null;
  subset: number[] | null;
  perksPages: { id: number; name: string }[];
  itemSets: { accountId: number; timestamp: number; itemSets: Record<string, unknown>[] };
  eogGameId: number | null;
  games: Record<number, unknown>;
  matchList: unknown[];
  mySelection: { spell1Id: number; spell2Id: number };
  selections: { puuid: string; championId: number }[];
}

export interface Call {
  method: string;
  path: string;
  body: unknown;
}

export const PUUID = 'puuid-celian';

export function defaultState(): MockState {
  return {
    phase: 'None',
    queue: { id: 2400, gameMode: 'KIWI' },
    session: null,
    subset: null,
    perksPages: [{ id: 1, name: 'Page perso' }],
    itemSets: { accountId: 1, timestamp: 1, itemSets: [{ uid: 'x', title: 'Mon set', blocks: [] }] },
    eogGameId: null,
    games: {},
    matchList: [],
    mySelection: { spell1Id: 32, spell2Id: 4 },
    selections: [],
  };
}

export async function startMockLcu(token = 'secret') {
  const dir = mkdtempSync(join(tmpdir(), 'mock-lcu-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
    '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' });
  const state = defaultState();
  const calls: Call[] = [];
  const expected = 'Basic ' + Buffer.from(`riot:${token}`).toString('base64');

  const server = https.createServer({ key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) }, (req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : undefined;
      const path = req.url || '';
      const method = req.method || 'GET';
      calls.push({ method, path, body });
      const send = (status: number, data?: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(data === undefined ? '' : JSON.stringify(data));
      };
      // API Live Client du jeu (port 2999 en vrai) : pas d'authentification
      if (path === '/liveclientdata/activeplayer') return (state as unknown as { live?: { me?: object } }).live?.me ? send(200, (state as unknown as { live: { me: object } }).live.me) : send(404);
      if (path === '/liveclientdata/gamestats') return send(200, { gameMode: 'KIWI', gameTime: 42, mapNumber: 12 });
      if (path === '/liveclientdata/playerlist') return (state as unknown as { live?: { players?: object } }).live?.players ? send(200, (state as unknown as { live: { players: object } }).live.players) : send(404);
      if (req.headers.authorization !== expected) return send(401, { message: 'unauthorized' });

      const route = `${method} ${path.split('?')[0]}`;
      let m: RegExpMatchArray | null;
      switch (true) {
        case route === 'GET /lol-gameflow/v1/gameflow-phase':
          return send(200, state.phase);
        case route === 'GET /lol-gameflow/v1/session':
          return send(200, { gameData: { gameId: (state as unknown as { gameId?: number }).gameId, queue: state.queue, playerChampionSelections: state.selections, ...(state as unknown as { teams?: object }).teams } });
        case route === 'GET /lol-summoner/v1/current-summoner':
          return send(200, { puuid: PUUID, gameName: 'Celian', tagLine: 'EUW', summonerId: 42, profileIconId: 4568, summonerLevel: 214 });
        case route === 'GET /lol-ranked/v1/current-ranked-stats':
          return send(200, { queues: [{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', division: 'II', leaguePoints: 47, wins: 31, losses: 28 }, { queueType: 'RANKED_FLEX_SR', tier: '', division: 'NA' }] });
        case route === 'GET /lol-game-data/assets/v1/champion-summary.json':
          return send(200, [
            { id: -1, name: 'Aucun', alias: 'None' },
            { id: 157, name: 'Yasuo', alias: 'Yasuo' },
            { id: 103, name: 'Ahri', alias: 'Ahri' },
            { id: 99, name: 'Lux', alias: 'Lux' },
            { id: 122, name: 'Darius', alias: 'Darius' },
            { id: 89, name: 'Leona', alias: 'Leona' },
            { id: 22, name: 'Ashe', alias: 'Ashe' },
            { id: 25, name: 'Morgana', alias: 'Morgana' },
            { id: 54, name: 'Malphite', alias: 'Malphite' },
            { id: 222, name: 'Jinx', alias: 'Jinx' },
          ]);
        case route === 'GET /lol-game-data/assets/v1/cherry-augments.json':
          return send(200, [{ id: 1058, nameTRA: 'Poing mystique', augmentSmallIconPath: '/lol-game-data/assets/ASSETS/UX/Cherry/Augments/Icons/MysticPunch_small.png' }]);
        case route === 'GET /lol-game-data/assets/v1/items.json':
          if (state.itemData) return send(200, state.itemData);
          return send(200, [{ id: 6333, name: 'Danse de la mort', iconPath: '/lol-game-data/assets/ASSETS/Items/Icons2D/6333_DeathsDance.png' }, { id: 3075, name: 'Cotte épineuse', iconPath: '/lol-game-data/assets/ASSETS/Items/Icons2D/3075_Thornmail.png' },
            { id: 3084, name: 'Heartsteel', priceTotal: 3000, categories: ['Health'] },
            { id: 2502, name: 'Unending Despair', priceTotal: 2800, categories: ['Health', 'Armor', 'AbilityHaste'] },
            { id: 4401, name: 'Force of Nature', priceTotal: 2800, categories: ['Health', 'SpellBlock'] },
            { id: 3111, name: "Mercury's Treads", priceTotal: 1250, categories: ['Boots', 'SpellBlock', 'Tenacity'] },
          ]);
        case route === 'GET /lol-game-data/assets/v1/perks.json':
          return send(200, [{ id: 8010, name: 'Conquérant', iconPath: '/lol-game-data/assets/v1/perk-images/Styles/Precision/Conqueror/Conqueror.png' }]);
        case route === 'GET /lol-game-data/assets/v1/perkstyles.json':
          return send(200, { styles: [{ id: 8000, name: 'Précision', iconPath: '/lol-game-data/assets/v1/perk-images/Styles/7201_Precision.png' }, { id: 8400, name: 'Volonté', iconPath: '/lol-game-data/assets/v1/perk-images/Styles/7204_Resolve.png' }] });
        case route === 'GET /lol-game-data/assets/v1/summoner-spells.json':
          return send(200, [{ id: 4, name: 'Saut éclair', iconPath: '/lol-game-data/assets/DATA/Spells/Icons2D/Summoner_Flash.png' }, { id: 32, name: 'Marque', iconPath: '/lol-game-data/assets/DATA/Spells/Icons2D/Summoner_Mark.png' }]);
        case route === 'GET /lol-champ-select/v1/session':
          return state.session ? send(200, state.session) : send(404, { message: 'no session' });
        case route === 'GET /lol-lobby-team-builder/champ-select/v1/subset-champion-list':
          return state.subset ? send(200, state.subset) : send(404, { message: 'no subset' });
        case !!(m = route.match(/^PATCH \/lol-champ-select\/v1\/session\/actions\/(\d+)$/)): {
          const s = state.session as { localPlayerCellId: number; myTeam: { cellId: number; championId: number }[] };
          const me = s.myTeam.find((p) => p.cellId === s.localPlayerCellId)!;
          me.championId = (body as { championId: number }).championId;
          state.subset = null;
          return send(204);
        }
        case !!(m = route.match(/^POST \/lol-champ-select\/v1\/session\/champion-swaps\/(\d+)\/request$/)):
          return send(200, { id: Number(m![1]), state: 'SENT' });
        case !!(m = route.match(/^POST \/lol-champ-select\/v1\/session\/bench\/swap\/(\d+)$/)): {
          const id = Number(m![1]);
          const s = state.session as { localPlayerCellId: number; myTeam: { cellId: number; championId: number }[]; benchChampions: { championId: number }[] };
          const me = s.myTeam.find((p) => p.cellId === s.localPlayerCellId)!;
          s.benchChampions = s.benchChampions.filter((b) => b.championId !== id).concat([{ championId: me.championId }]);
          me.championId = id;
          return send(204);
        }
        case route.startsWith('GET /lol-perks/v1/recommended-pages/champion/'):
          return send(200, [{ championId: Number(path.split('/')[6]), primaryPerkStyleId: 8000, secondaryPerkStyleId: 8400, perks: [{ id: 8010 }, { id: 9111 }, { id: 9104 }, { id: 8299 }, { id: 8444 }, { id: 8242 }, { id: 5005 }, { id: 5008 }, { id: 5001 }] }]);
        case route === 'GET /lol-perks/v1/pages':
          return send(200, state.perksPages);
        case route === 'GET /lol-champion-mastery/v1/local-player/champion-mastery':
          return send(200, [{ championId: 89, championLevel: 12, championPoints: 154321 }]);
        case route === 'GET /lol-patch/v1/game-version':
          return send(200, (state as unknown as { gameVersion?: string }).gameVersion ?? '16.21.123.4567');
        case route === 'GET /lol-matchmaking/v1/ready-check':
          return send(200, { state: 'InProgress', playerResponse: (state as unknown as { accepted?: boolean }).accepted ? 'Accepted' : 'None' });
        case route === 'POST /lol-matchmaking/v1/ready-check/accept':
          (state as unknown as { accepted?: boolean }).accepted = true;
          return send(204);
        case route === 'POST /lol-perks/v1/pages': {
          const page = { id: 99, ...(body as object) } as { id: number; name: string };
          state.perksPages.push(page);
          return send(200, page);
        }
        case !!route.match(/^PUT \/lol-perks\/v1\/pages\/\d+$/):
          return send(200, body);
        case route === 'PUT /lol-perks/v1/currentpage':
          return send(204);
        case route === 'GET /lol-champ-select/v1/session/my-selection':
          return send(200, state.mySelection);
        case route === 'PATCH /lol-champ-select/v1/session/my-selection':
          state.mySelection = body as MockState['mySelection'];
          return send(204);
        case route === 'GET /lol-item-sets/v1/item-sets/42/sets':
          return send(200, state.itemSets);
        case route === 'PUT /lol-item-sets/v1/item-sets/42/sets':
          state.itemSets = body as MockState['itemSets'];
          return send(201);
        case route === 'GET /lol-end-of-game/v1/eog-stats-block':
          return state.eogGameId ? send(200, { gameId: state.eogGameId }) : send(404);
        case route === 'GET /lol-match-history/v1/products/lol/current-summoner/matches':
          return send(200, { games: { games: state.matchList } });
        case !!(m = route.match(/^GET \/lol-match-history\/v1\/games\/(\d+)$/)):
          return state.games[Number(m![1])] ? send(200, state.games[Number(m![1])]) : send(404);
        default:
          return send(404, { message: `mock: ${route}` });
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return { state, calls, port, token, close: () => new Promise<void>((r) => server.close(() => r())) };
}

export function game(gameId: number, queueId: number, championId: number, win: boolean, augments: number[] = []) {
  const stats: Record<string, number | boolean> = {
    win, kills: 10, deaths: 5, assists: 20, item0: 3031, item1: 3006, item2: 0, champLevel: 18,
    totalDamageDealtToChampions: 42000, totalDamageTaken: 30000, totalHeal: 5000, goldEarned: 16000, totalMinionsKilled: 60, largestMultiKill: 3,
  };
  augments.forEach((a, i) => (stats[`playerAugment${i + 1}`] = a));
  return {
    gameId,
    queueId,
    gameMode: queueId === 450 ? 'ARAM' : queueId === 2400 ? 'KIWI' : 'CLASSIC',
    gameCreation: 1_760_000_000_000 + gameId,
    gameDuration: 1100,
    participantIdentities: [
      { participantId: 1, player: { puuid: PUUID, gameName: 'g00dluckBud', tagLine: 'EUW' } },
      { participantId: 2, player: { puuid: 'other', gameName: 'Adversaire', tagLine: 'EUW' } },
    ],
    participants: [
      { participantId: 1, championId, teamId: 100, spell1Id: 4, spell2Id: 32, stats },
      { participantId: 2, championId: 22, teamId: 200, spell1Id: 4, spell2Id: 7, stats: { win: !win, kills: 3, deaths: 10, assists: 4, totalDamageDealtToChampions: 21000, goldEarned: 11000, item0: 3006 } },
    ],
  };
}
