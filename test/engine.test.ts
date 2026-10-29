// Scénario complet contre le faux client : connexion, champ select Mayhem, choix de carte,
// banc, import runes/sorts/item set, panneau d'augments, fin de partie enregistrée.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../src/core/engine';
import { Balance } from '../src/core/balance';
import { Arammeta } from '../src/core/arammeta';
import { startMockLcu, game } from './mock-lcu';

const fixtures = join(__dirname, 'fixtures');
const offlineBalance = () => new Balance(mkdtempSync(join(tmpdir(), 'bal-')), async () => { throw new Error('hors ligne'); });
const fixtureFetcher = async (url: string) => {
  const rel = url.replace('https://arammeta.com/api/', '');
  return readFileSync(join(fixtures, rel), 'utf8');
};

let mock: Awaited<ReturnType<typeof startMockLcu>>;
let engine: Engine;
let dataDir: string;

beforeAll(async () => {
  mock = await startMockLcu();
  dataDir = mkdtempSync(join(tmpdir(), 'aram-companion-'));
  engine = new Engine({
    dataDir,
    discover: async () => ({ port: mock.port, token: mock.token }),
    arammeta: new Arammeta(join(dataDir, 'cache'), fixtureFetcher),
    balance: offlineBalance(),
    live: { port: 1 }, // pas de Live Client dans ce test
  });
  // start() lance la boucle ; on pilote les ticks à la main ensuite
  await engine.refreshData(false);
});

afterAll(async () => {
  engine.stop();
  await mock.close();
});

const settle = () => new Promise((r) => setTimeout(r, 150));

describe('moteur contre un faux client League', () => {
  it('se connecte et importe l’historique ARAM/Mayhem du client', async () => {
    mock.state.matchList = [game(1, 450, 54, true), game(2, 420, 54, true), game(3, 2400, 157, false, [1058, 3078])];
    mock.state.games = { 1: game(1, 450, 54, true), 3: game(3, 2400, 157, false, [1058, 3078]) };
    await engine.tick();
    await settle();
    expect(engine.state.connection).toBe('connected');
    expect(engine.state.summonerName).toBe('Celian');
    await new Promise((r) => setTimeout(r, 50));
    expect(engine.state.player).toMatchObject({ riotId: 'Celian#EUW', level: 214, ranks: [{ queue: 'Solo/Duo', tier: 'GOLD', division: 'II', lp: 47 }] });
    expect(engine.state.data.patch).toBe('16.21');
    expect(engine.state.stats.total).toBe(2); // la partie classée (420) est ignorée
    expect(engine.state.stats.augments.find((a) => a.id === 1058)?.name).toBe('Poing mystique');
  });

  it('classe les cartes proposées en champ select Mayhem et choisit une carte', async () => {
    mock.state.phase = 'ChampSelect';
    mock.state.queue = { id: 2400, gameMode: 'KIWI' };
    mock.state.subset = [89, 222];
    mock.state.session = {
      localPlayerCellId: 0,
      myTeam: [
        { cellId: 0, championId: 0 },
        { cellId: 1, championId: 157 },
        { cellId: 2, championId: 22 },
        { cellId: 3, championId: 103 },
        { cellId: 4, championId: 25 },
      ],
      benchEnabled: true,
      benchChampions: [{ championId: 54 }],
      actions: [[{ id: 7, actorCellId: 0, championId: 0, completed: false, isInProgress: true, type: 'pick' }]],
    };
    await engine.tick();
    const cs = engine.state.champSelect!;
    expect(engine.state.mode).toBe('mayhem');
    expect(cs.cardsOpen).toBe(true);
    expect(cs.candidates.map((c) => c.championId).sort((a, b) => a - b)).toEqual([54, 89, 222]);
    expect(cs.candidates.find((c) => c.championId === 89)!.actionable).toBe(true);
    expect(cs.candidates.find((c) => c.championId === 89)!.mastery).toEqual({ level: 12, points: 154321 });
    expect(cs.candidates.find((c) => c.championId === 54)!.mastery).toBeNull();
    expect(cs.candidates.find((c) => c.championId === 54)!.actionable).toBe(false); // banc verrouillé pendant les cartes

    const res = await engine.pickChampion(89);
    expect(res.ok).toBe(true);
    const patch = mock.calls.find((c) => c.method === 'PATCH' && c.path === '/lol-champ-select/v1/session/actions/7');
    expect(patch?.body).toEqual({ championId: 89, completed: true });
    expect(engine.state.champSelect!.myChampionName).toBe('Leona');
  });

  it('importe runes et sorts quand le champion est stable, sans toucher aux pages perso', async () => {
    await engine.setSettings({ autoItemSet: true });
    await engine.tick(); // 2e relevé avec Leona -> import auto
    await settle();
    const created = mock.calls.find((c) => c.method === 'POST' && c.path === '/lol-perks/v1/pages');
    expect(created?.body).toMatchObject({ name: 'ARAM Companion', primaryStyleId: 8000, subStyleId: 8400 });
    expect(mock.state.perksPages.find((p) => p.name === 'Page perso')).toBeTruthy();
    expect(mock.calls.some((c) => c.method === 'PATCH' && c.path === '/lol-champ-select/v1/session/my-selection')).toBe(true);
    // Item set ajouté, le set existant conservé
    const titles = mock.state.itemSets.itemSets.map((s) => s.title);
    expect(titles).toContain('Mon set');
    expect(titles).toContain('ARAM Companion – Leona');
    expect(engine.state.augments?.championName).toBe('Leona');
    expect(engine.state.augments?.top.kPrismatic.length).toBeGreaterThan(0);
    // Build avec icônes : runes du client, sorts et items arammeta
    const build = engine.state.build!;
    expect(build.championName).toBe('Leona');
    expect(build.runes?.primary?.name).toBe('Précision');
    expect(build.runes?.perks[0]).toMatchObject({ id: 8010, name: 'Conquérant' });
    expect(build.runes?.perks[0].icon).toMatch(/^https:\/\/raw\.communitydragon\.org\/.*conqueror\.png$/);
    expect(build.spells[0].items.map((x) => x.id).length).toBe(2);
    expect(build.cores.length).toBeGreaterThan(0);
    expect(build.cores[0].core.every((i) => i.icon)).toBe(true);
    expect(build.boots.length).toBeGreaterThan(0);
  });

  it('prend un champion sur le banc une fois les cartes fermées', async () => {
    await engine.tick();
    const cs = engine.state.champSelect!;
    expect(cs.cardsOpen).toBe(false);
    expect(cs.candidates.find((c) => c.championId === 54)!.actionable).toBe(true);
    const res = await engine.pickChampion(54);
    expect(res.ok).toBe(true);
    expect(mock.calls.some((c) => c.method === 'POST' && c.path === '/lol-champ-select/v1/session/bench/swap/54')).toBe(true);
    expect(engine.state.champSelect!.myChampionId).toBe(54);
  });

  it('repère les coéquipiers déjà croisés au champ select', async () => {
    const e = engine as unknown as { history: { games: { allyNames?: string[]; win: boolean }[] } };
    e.history.games.push({ allyNames: ['Pote#EUW'], win: true } as never, { allyNames: ['Pote#EUW'], win: false } as never);
    const session = mock.state.session as unknown as { myTeam: { cellId: number; gameName?: string; tagLine?: string }[] };
    session.myTeam[1].gameName = 'Pote';
    session.myTeam[1].tagLine = 'EUW';
    await engine.tick();
    expect(engine.state.champSelect!.mates).toEqual([{ name: 'Pote#EUW', games: 2, wins: 1 }]);
    e.history.games.splice(-2, 2);
    delete session.myTeam[1].gameName;
  });

  it('propose un échange avec un allié, en le comptant dans la bonne équipe', async () => {
    const session = mock.state.session as unknown as { myTeam: { cellId: number; championId: number }[]; trades?: object[] };
    const ally = session.myTeam.find((p) => p.cellId !== 0 && p.championId)!;
    session.trades = [{ id: 77, cellId: ally.cellId, state: 'AVAILABLE' }];
    await engine.tick();
    const t = engine.state.champSelect!.candidates.find((c) => c.source === 'trade')!;
    expect(t.championId).toBe(ally.championId);
    expect(t.actionable).toBe(true);
    // pas de synergie de l'allié avec lui-même
    expect(t.reasons.some((r) => r.label.includes(`${t.name} `) && r.label.startsWith('Synergie'))).toBe(false);
    const res = await engine.pickChampion(ally.championId);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('allié doit accepter');
    expect(mock.calls.some((c) => c.method === 'POST' && c.path === '/lol-champ-select/v1/session/champion-swaps/77/request')).toBe(true);
    session.trades = [];
    await engine.tick();
  });

  it('affiche le panneau d’augments en partie et enregistre la partie à la fin', async () => {
    mock.state.phase = 'InProgress';
    await engine.tick();
    expect(engine.state.augments?.championId).toBe(54);
    mock.state.phase = 'EndOfGame';
    mock.state.eogGameId = 77;
    mock.state.games[77] = game(77, 2400, 54, true, [1058]);
    await engine.tick();
    expect(engine.state.stats.total).toBe(3);
    expect(engine.state.stats.recent[0].gameId).toBe(77);
    expect(existsSync(join(dataDir, 'history.json'))).toBe(true);
    const callsBefore = mock.calls.length;
    await engine.tick(); // pas de double enregistrement
    expect(mock.calls.slice(callsBefore).some((c) => c.path.includes('/games/77'))).toBe(false);
  });

  it('enregistre la partie via l’ID de session si l’écran de fin ne le donne pas', async () => {
    mock.state.phase = 'ChampSelect';
    await engine.tick();
    mock.state.phase = 'InProgress';
    (mock.state as unknown as { gameId: number }).gameId = 88;
    await engine.tick();
    mock.state.phase = 'EndOfGame';
    mock.state.eogGameId = null;
    mock.state.games[88] = game(88, 2400, 54, false, [3078]);
    await engine.tick();
    expect(engine.state.stats.recent.some((g) => g.gameId === 88)).toBe(true);
  });

  it('retrouve ton champion si l’app est lancée en pleine partie', async () => {
    const fresh = new Engine({
      dataDir: mkdtempSync(join(tmpdir(), 'aram-companion-')),
      discover: async () => ({ port: mock.port, token: mock.token }),
      arammeta: new Arammeta(join(dataDir, 'cache2'), fixtureFetcher),
      balance: offlineBalance(),
      live: { port: 1 },
    });
    await fresh.refreshData(false);
    mock.state.phase = 'InProgress';
    mock.state.queue = { id: 2400, gameMode: 'KIWI' };
    mock.state.session = null;
    mock.state.selections = [{ puuid: 'puuid-celian', championId: 157 }];
    await fresh.tick(); // connexion
    await fresh.tick();
    expect(fresh.state.augments?.championName).toBe('Yasuo');
    expect(fresh.state.augments?.top.kPrismatic[0].name).toBe('Poing mystique'); // nom FR venant du client
  });

  it('historique : parties détaillées et détail des 10 joueurs à la demande', async () => {
    const list = engine.getHistory();
    expect(list.length).toBeGreaterThan(0);
    const g = list[0];
    expect(g.items).toEqual([3031, 3006]);
    expect(g.damage).toBe(42000);
    expect(g.teamKills).toBe(10);
    expect(g.enemies).toEqual([22]);
    expect(g.itemIcons[0].icon).toContain('http');
    const d = await engine.gameDetail(g.gameId);
    expect(d?.teams).toHaveLength(2);
    expect(d!.teams[0].players[0].me).toBe(true); // ton équipe d'abord
    expect(d!.teams[0].players[0].name).toBe('g00dluckBud#EUW');
    expect(d!.teams[1].players[0].spells.map((x) => x.id)).toEqual([4, 7]);
    expect(await engine.gameDetail(999_999)).toBeNull();
  });

  it('conseille des items selon l’équipe adverse en partie', async () => {
    mock.state.phase = 'Lobby';
    mock.state.session = null;
    await engine.tick(); // oublie le champion des tests précédents
    mock.state.phase = 'InProgress';
    mock.state.queue = { id: 2400, gameMode: 'KIWI' };
    mock.state.selections = [{ puuid: 'puuid-celian', championId: 222 }];
    (mock.state as unknown as { teams: object }).teams = {
      teamOne: [{ puuid: 'puuid-celian', championId: 222 }, { puuid: 'a', championId: 89 }],
      teamTwo: [12, 412, 25, 103, 32].map((championId) => ({ puuid: `e${championId}`, championId })), // Alistar, Thresh, Morgana, Ahri, Amumu
    };
    await engine.tick();
    const c = engine.state.counters!;
    expect(c.enemies.map((e) => e.name)).toContain('Alistar');
    expect(c.role).toBe('ad'); // Jinx
    const keys = c.threats.map((t) => t.key);
    expect(keys).toContain('mr'); // équipe très magique
    expect(keys).toContain('pen'); // Alistar, Thresh, Amumu en front
    expect(c.threats.find((t) => t.key === 'pen')!.items[0].name).toBeTruthy();
    expect(engine.state.build?.balance?.some((b) => b.label.includes('dégâts'))).toBe(true); // Jinx −10 % dégâts
    mock.state.phase = 'Lobby';
    await engine.tick();
    expect(engine.state.counters).toBeNull();
  });

  it('accepte la partie seulement si l’option est active, une seule fois', async () => {
    mock.state.queue = { id: 450, gameMode: 'ARAM' };
    mock.state.phase = 'ReadyCheck';
    await engine.tick();
    expect(mock.calls.some((c) => c.path.includes('ready-check/accept'))).toBe(false);
    await engine.setSettings({ autoAccept: true });
    await engine.tick();
    await engine.tick();
    expect(mock.calls.filter((c) => c.path.includes('ready-check/accept'))).toHaveLength(1);
    await engine.setSettings({ autoAccept: false });
  });

  it('augments : pièges fréquents et types qui marchent ; build : autres items gagnants', async () => {
    mock.state.phase = 'Lobby';
    mock.state.session = null;
    await engine.tick();
    const yasuo = await (engine as unknown as { augmentPanel(id: number): Promise<import('../src/core/types').AugmentPanel> }).augmentPanel(157);
    expect(yasuo.traps?.map((t) => t.id)).toContain(3018); // Big Shot : 7 % de pick, 48 % de winrate
    expect(yasuo.traps!.every((t) => t.winrate <= 0.5829 - 0.03)).toBe(true);
    // pièges perso : historique du test avec 1058/3078/1206 (Yasuo) gagnés → aucun piège perso
    expect(yasuo.myTraps).toEqual([]);
    expect(yasuo.types?.bad.length).toBeGreaterThan(0);
    const gold = yasuo.all!.kGold;
    expect(gold.length).toBeGreaterThan(3);
    expect(gold[0].winrate).toBeGreaterThanOrEqual(gold[gold.length - 1].winrate);
    expect(yasuo.all!.kPrismatic.some((a) => a.id === 3018)).toBe(true); // Big Shot est prismatique
    // The Boom and the Bass sur Yasuo : 70,7 % au 1er choix, 63,1 % au 4e (données du champion), ramenés vers la
    // moyenne selon le nombre de parties : on garde l'ordre (1er choix > 4e) et des valeurs proches
    const boom = yasuo.top.kGold.find((a) => a.id === 3078)!;
    expect(boom.rounds![0]).toBeGreaterThan(boom.rounds![3]!);
    expect(boom.rounds![0]).toBeLessThan(0.7074);
    expect(boom.rounds![0]).toBeGreaterThan(0.66);
    const build = await (engine as unknown as { buildPanel(id: number, m: string): Promise<import('../src/core/types').BuildPanel> }).buildPanel(157, 'mayhem');
    const shown = new Set(build.cores.flatMap((c) => [...c.core, ...c.options].map((x) => x.id)));
    expect(build.singles!.length).toBeGreaterThan(0);
    expect(build.singles!.some((x) => shown.has(x.id))).toBe(false);
  });

  it('recharge les données quand le client passe à un nouveau patch', async () => {
    (mock.state as unknown as { gameVersion: string }).gameVersion = '16.22.700.1';
    (engine as unknown as { lastPatchCheck: number }).lastPatchCheck = 0;
    await engine.checkPatch();
    expect(engine.state.data.clientPatch).toBe('16.22');
    expect(engine.state.log[0].text).toContain('16.22'); // fixtures encore en 16.21 → avertissement
    (mock.state as unknown as { gameVersion: string }).gameVersion = '16.21.1.1';
  });

  it('exploration hors partie : liste des champions et build de n’importe quel champion', async () => {
    const list = engine.listChampions();
    expect(list.some((c) => c.id === 157 && c.name === 'Yasuo')).toBe(true);
    expect(list.every((c) => !c.name.startsWith('#'))).toBe(true);
    const b = await engine.championBuild(54);
    expect(b?.championId).toBe(54);
    expect(b?.cores.length).toBeGreaterThan(0);
  });

  it('signale les changements d’équilibrage récents', async () => {
    const b = (engine as unknown as { balance: { changes: object[] } }).balance;
    b.changes = [{ champion: 'jinx', at: Date.now(), before: { dmg_dealt: 0.95 }, after: { dmg_dealt: 0.9 } }];
    const list = engine.balanceChanges();
    expect(list[0]).toMatchObject({ championId: 222 });
    expect(list[0].text).toContain('−5 % dégâts → −10 % dégâts');
    b.changes = [];
  });

  it('garde l’aperçu « Tester » hors partie au lieu de l’effacer au tick suivant', async () => {
    mock.state.phase = 'Lobby';
    await engine.tick();
    expect(engine.state.build).toBeNull();
    expect(await engine.previewPanel()).toBe(true);
    await engine.tick();
    expect(engine.state.build?.championName).toBeTruthy();
  });

  it('prochain achat en partie à partir de ton or et de tes items (API Live Client)', async () => {
    const probeDir = mkdtempSync(join(tmpdir(), 'probe-'));
    const fresh = new Engine({
      probeDir,
      dataDir: mkdtempSync(join(tmpdir(), 'aram-companion-')),
      discover: async () => ({ port: mock.port, token: mock.token }),
      arammeta: new Arammeta(join(dataDir, 'cache3'), fixtureFetcher),
      balance: offlineBalance(),
      live: { port: mock.port },
    });
    await fresh.refreshData(false);
    mock.state.phase = 'InProgress';
    mock.state.queue = { id: 2400, gameMode: 'KIWI' };
    mock.state.session = null;
    mock.state.selections = [{ puuid: 'puuid-celian', championId: 157 }];
    (mock.state as unknown as { live: object }).live = {
      me: { currentGold: 1234.7, level: 12, riotId: 'Celian#EUW' },
      players: [{ riotId: 'Celian#EUW', items: [] }, { riotId: 'Autre#EUW', items: [{ itemID: 3031 }] }],
    };
    await fresh.tick();
    await fresh.tick();
    const nb = fresh.state.nextBuy!;
    expect(nb.gold).toBe(1234);
    expect(fresh.state.augRound).toBe(3); // niveau 12 → 3e choix
    expect(nb.rows.length).toBeGreaterThan(0);
    const firstCore = fresh.state.build!.cores[0].core[0].id;
    expect(nb.rows[0].item.id).toBe(firstCore);
    // diagnostic headliner : captures sans identifiants
    const { readdirSync, readFileSync: rf } = await import('node:fs');
    await new Promise((r) => setTimeout(r, 50));
    const files = readdirSync(probeDir);
    expect(files.some((f) => f.startsWith('liveclient-'))).toBe(true);
    const live = rf(join(probeDir, files.find((f) => f.startsWith('liveclient-'))!), 'utf8');
    expect(live).toContain('KIWI');
    expect(live).not.toContain('Celian#EUW');
    (mock.state as unknown as { live?: object }).live = undefined;
  });

  it('repasse en recherche quand le client se ferme', async () => {
    await mock.close();
    await engine.tick();
    expect(engine.state.connection).toBe('searching');
    expect(engine.state.champSelect).toBeNull();
  });
});

import { shrink } from '../src/core/engine';
describe('shrink', () => {
  it('un winrate sur peu de parties est ramené vers la moyenne', () => {
    expect(shrink(0.6, 120, 0.5)).toBeLessThan(shrink(0.56, 5000, 0.5));
    expect(shrink(0.56, 5000, 0.5)).toBeCloseTo(0.5556, 3);
  });
});
