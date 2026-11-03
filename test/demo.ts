// Faux client League pour démo / captures : node demo.cjs <scenario>
// Scénarios : champselect | ingame | purchase (recette synthétique) | stats | sr | sringame
import { startMockLcu, game, PUUID } from './mock-lcu';

const scenario = process.argv[2] || 'champselect';
const inGame = scenario === 'ingame' || scenario === 'purchase';

const mock = await startMockLcu('demo');
const s = mock.state;
// Répétition sur l'historique réel : les champions de ces parties, sous un nom factice
if (process.env.ARAM_DEMO_CHAMPS) (s as unknown as { champions: unknown[] }).champions = process.env.ARAM_DEMO_CHAMPS.split(',').map((id) => ({ id: Number(id), name: `C${id}`, alias: `C${id}` }));
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
    me: { currentGold: 2140, level: 12, riotId: 'Celian#EUW', abilities: { Passive: {}, Q: { abilityLevel: 3, displayName: 'Shield of Daybreak' }, W: { abilityLevel: 5, displayName: 'Eclipse' }, E: { abilityLevel: 1, displayName: 'Zenith Blade' }, R: { abilityLevel: 2, displayName: 'Solar Flare' } } },
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
  // ARAM_DEMO_BAG=sell : sac plein avec un composant à vendre ; full : 6 items finis
  const bag = process.env.ARAM_DEMO_BAG;
  if (bag) {
    s.itemData.push(...[9001, 9002, 9003].map((id) => ({ id, name: `Item fini ${id} (test)`, priceTotal: 3000, categories: ['Health'] })), { id: 9004, name: 'Composant orphelin (test)', priceTotal: 435, to: [] }, { id: 9005, name: 'Item fini 9005 (test)', priceTotal: 3000, categories: ['Health'] }, { id: 4401, name: 'Force of Nature', priceTotal: 2800, categories: ['Health', 'SpellBlock'] });
    live.players[0].items = [3084, 3111, 9001, 9002, 9003, bag === 'full' ? 9005 : 9004].map((itemID, slot) => ({ itemID, slot }));
  }
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
// Écart d'objets : camps, niveaux et prix pour les scénarios en partie
if (process.env.ARAM_DEMO_GAP) {
  const live = (s as unknown as { live?: { players: { team?: string; level?: number; position?: string }[] } }).live;
  if (process.env.ARAM_DEMO_GAP === 'roles') {
    const pad = (team: string, position: string, alias: string, itemID: number) => ({ riotId: `${alias}#1`, team, position, rawChampionName: `game_character_displayname_${alias}`, level: 9, items: [{ itemID }] });
    live?.players.push(pad('ORDER', 'JUNGLE', 'Vi', 3111), pad('ORDER', 'BOTTOM', 'Jinx', 3033), pad('ORDER', 'UTILITY', 'Nami', 3020), pad('CHAOS', 'BOTTOM', 'Caitlyn', 3033), pad('CHAOS', 'UTILITY', 'Soraka', 3020));
  }
  live?.players.forEach((p, i) => { p.team ??= i < 5 ? 'ORDER' : 'CHAOS'; p.level ??= 12 - (i % 3); });
  s.itemData = [[3084, 3000], [3111, 1250], [3157, 3250], [3020, 1100], [3075, 2450], [3033, 3000], [3076, 800], [3118, 3000], [6655, 3100], [6631, 3200]].map(([id, priceTotal]) => ({ id, name: `Objet ${id}`, priceTotal }));
}
// Collection : 89 (Leona) dans la rotation, le reste absent. Le remplissage garde la lecture valide.
if (process.env.ARAM_DEMO_CLIENT) (s as unknown as { gameVersion: string }).gameVersion = process.env.ARAM_DEMO_CLIENT;
if (process.env.ARAM_DEMO_POOL) {
  const entry = (id: number, owned = true, freeToPlay = false) => ({ id, freeToPlay, ownership: { owned } });
  (s as unknown as { collection: unknown }).collection = [...Array.from({ length: 30 }, (_, i) => entry(5000 + i)), entry(54), entry(22), entry(89, false, true)];
}
console.log(JSON.stringify({ port: mock.port, token: 'demo' }));
