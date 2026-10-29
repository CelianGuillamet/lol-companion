// Faux client League pour démo / captures : node demo.cjs <scenario>
// Scénarios : champselect | ingame | purchase (recette synthétique) | stats | sr | sringame
import { startMockLcu, game, PUUID } from './mock-lcu';

const scenario = process.argv[2] || 'champselect';
const inGame = scenario === 'ingame' || scenario === 'purchase';

const mock = await startMockLcu('demo');
const s = mock.state;
s.matchList = [
  game(11, 2400, 157, true, [1058, 3078, 1206]),
  game(12, 2400, 89, true, [1058, 1206]),
  game(13, 450, 54, false),
  game(14, 2400, 222, false, [3078]),
  game(15, 450, 89, true),
];
s.games = Object.fromEntries((s.matchList as { gameId: number }[]).map((g) => [g.gameId, g]));

if (scenario === 'champselect' || inGame) {
  s.phase = inGame ? 'InProgress' : 'ChampSelect';
  s.queue = { id: 2400, gameMode: 'KIWI' };
  s.subset = scenario === 'champselect' ? [89, 222] : null;
  s.session = {
    localPlayerCellId: 0,
    myTeam: [
      { cellId: 0, championId: inGame ? 89 : 0 },
      { cellId: 1, championId: 157 },
      { cellId: 2, championId: 22 },
      { cellId: 3, championId: 103 },
      { cellId: 4, championId: 901 },
    ],
    benchEnabled: true,
    benchChampions: [{ championId: 54 }, { championId: 412 }],
    actions: [[{ id: 7, actorCellId: 0, championId: 0, completed: false, isInProgress: true, type: 'pick' }]],
  };
}
if (inGame) {
  s.session = null;
  s.selections = [{ puuid: PUUID, championId: 89 }];
  (s as unknown as { teams: object }).teams = {
    teamOne: [{ puuid: PUUID, championId: 89 }, ...[31, 82, 429, 99].map((championId) => ({ puuid: `a${championId}`, championId }))],
    teamTwo: [12, 412, 25, 103, 32].map((championId) => ({ puuid: `e${championId}`, championId })),
  };
  (s as unknown as { live: object }).live = {
    me: { currentGold: 2140, level: 12, riotId: 'Celian#EUW' },
    players: [
      { riotId: 'Celian#EUW', rawChampionName: 'game_character_displayname_Leona', isDead: true, respawnTimer: 11.4, items: [{ itemID: 3084 }, { itemID: 3111 }], scores: { kills: 2, deaths: 5, assists: 14 } },
      { riotId: 'B#1', rawChampionName: 'game_character_displayname_Morgana', items: [{ itemID: 3157 }, { itemID: 3020 }], scores: { kills: 9, deaths: 2, assists: 6 } },
      { riotId: 'C#1', rawChampionName: 'game_character_displayname_Ahri', items: [{ itemID: 3020 }], scores: { kills: 4, deaths: 4, assists: 5 } },
      { riotId: 'D#1', rawChampionName: 'game_character_displayname_Alistar', items: [], scores: { kills: 0, deaths: 3, assists: 12 } },
      { riotId: 'E#1', rawChampionName: 'game_character_displayname_Thresh', items: [{ itemID: 3075 }], scores: { kills: 1, deaths: 6, assists: 3 } },
      { riotId: 'F#1', rawChampionName: 'game_character_displayname_Amumu', items: [], scores: { kills: 2, deaths: 4, assists: 8 } },
      { riotId: 'G#1', rawChampionName: 'game_character_displayname_Kalista', items: [{ itemID: 3033 }], scores: { kills: 6, deaths: 3, assists: 4 } },
      { riotId: 'H#1', rawChampionName: 'game_character_displayname_Mordekaiser', items: [{ itemID: 3076 }], scores: { kills: 3, deaths: 3, assists: 4 } },
    ],
  };
}
if (scenario === 'purchase') {
  // Données de test uniquement : recette volontairement simple, sans prétendre décrire le patch courant.
  s.itemData = [
    { id: 3084, name: 'Heartsteel', priceTotal: 3000, categories: ['Health'] },
    { id: 3111, name: "Mercury's Treads", priceTotal: 1250, categories: ['Boots', 'SpellBlock'] },
    { id: 2502, name: 'Objet final (test)', priceTotal: 2800, from: [1057, 3066], categories: ['Health', 'Armor'] },
    { id: 1057, name: 'Composant amélioré (test)', priceTotal: 1000, from: [1033], to: [2502] },
    { id: 1033, name: 'Composant possédé (test)', priceTotal: 400, to: [1057] },
    { id: 3066, name: 'Autre composant (test)', priceTotal: 800, to: [2502] },
  ];
  const live = (s as unknown as { live: { me: { currentGold: number }; players: { items: { itemID: number }[] }[] } }).live;
  live.me.currentGold = Number(process.env.ARAM_DEMO_GOLD ?? 600);
  live.players[0].items = [3084, 3111, 1033].map((itemID) => ({ itemID }));
}
// Faille (classée solo, mid) : champ select Ahri survolée contre Lux, puis en partie avec les rôles du Live Client
if (scenario === 'sr' || scenario === 'sringame') {
  s.phase = scenario === 'sr' ? 'ChampSelect' : 'InProgress';
  s.queue = { id: 420, gameMode: 'CLASSIC' };
  s.subset = null;
  s.session =
    scenario === 'sr'
      ? {
          localPlayerCellId: 0,
          myTeam: [
            { cellId: 0, championId: 0, championPickIntent: 103, assignedPosition: 'MIDDLE' },
            { cellId: 1, championId: 157, assignedPosition: 'TOP' },
            { cellId: 2, championId: 0, assignedPosition: 'JUNGLE' },
            { cellId: 3, championId: 0, assignedPosition: 'BOTTOM' },
            { cellId: 4, championId: 0, assignedPosition: 'UTILITY' },
          ],
          theirTeam: [{ cellId: 5, championId: 99 }, { cellId: 6, championId: 122 }, { cellId: 7, championId: 0 }],
          actions: [[{ id: 9, actorCellId: 0, championId: 103, completed: false, isInProgress: true, type: 'pick' }]],
        }
      : null;
  if (scenario === 'sringame') {
    s.selections = [{ puuid: PUUID, championId: 103 }];
    (s as unknown as { teams: object }).teams = {
      teamOne: [{ puuid: PUUID, championId: 103 }, ...[157, 64, 22, 412].map((championId) => ({ puuid: `a${championId}`, championId }))],
      teamTwo: [99, 122, 11, 51, 117].map((championId) => ({ puuid: `e${championId}`, championId })),
    };
    (s as unknown as { live: object }).live = {
      me: { currentGold: 1480, level: 9, riotId: 'Celian#EUW' },
      players: [
        { riotId: 'Celian#EUW', team: 'ORDER', position: 'MIDDLE', rawChampionName: 'game_character_displayname_Ahri', items: [{ itemID: 3118 }, { itemID: 3020 }], scores: { kills: 4, deaths: 2, assists: 3 } },
        { riotId: 'B#1', team: 'ORDER', position: 'TOP', rawChampionName: 'game_character_displayname_Yasuo', items: [], scores: { kills: 1, deaths: 3, assists: 1 } },
        { riotId: 'X#1', team: 'CHAOS', position: 'MIDDLE', rawChampionName: 'game_character_displayname_Lux', items: [{ itemID: 6655 }], scores: { kills: 2, deaths: 4, assists: 2 } },
        { riotId: 'Y#1', team: 'CHAOS', position: 'TOP', rawChampionName: 'game_character_displayname_Darius', items: [{ itemID: 6631 }], scores: { kills: 5, deaths: 1, assists: 0 } },
        { riotId: 'Z#1', team: 'CHAOS', position: 'JUNGLE', rawChampionName: 'game_character_displayname_MasterYi', items: [], scores: { kills: 3, deaths: 2, assists: 1 } },
      ],
    };
  }
}
console.log(JSON.stringify({ port: mock.port, token: 'demo' }));
