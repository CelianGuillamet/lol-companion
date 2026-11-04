// Scénario complet contre le faux client : connexion, champ select Mayhem, choix de carte,
// banc, import runes/sorts/item set, panneau d'augments, fin de partie enregistrée.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HEADLINERS } from '../src/core/headliner';
import { reviewChoice, reviewGame } from '../src/core/review';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PATCHES } from '../src/core/patchchanges';
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
    augInfoFetcher: async () => { throw new Error('hors ligne'); },
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

describe('headliner et skins', () => {
  it('retire un headliner lu qui n’est qu’un nom de skin', () => {
    const info = { key: 'disco', name: 'Disco', tips: [] };
    engine.state.headliner = null;
    engine.setHeadliner(info, 'écran', 'Space Groove');
    engine.dropSkinHeadliner(['Ziggs']);
    expect(engine.state.headliner).toMatchObject({ key: 'disco' });
    engine.dropSkinHeadliner(['Space Groove Rell']);
    expect(engine.state.headliner).toBeNull();
    engine.setHeadliner(info, 'cartes');
    engine.dropSkinHeadliner(['Space Groove Rell']);
    expect(engine.state.headliner).toMatchObject({ key: 'disco' });
    engine.state.headliner = null;
  });
});

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
    expect(cs.candidates.every((c) => !c.patchChange)).toBe(true);
    PATCHES[0].champions.Leona = ['buff', 'test'];
    engine.state.data.clientPatch = '16.22';
    await engine.tick();
    expect(engine.state.champSelect!.candidates.find((c) => c.championId === 89)!.patchChange).toMatchObject({ dir: 'buff', patch: '26.22' });
    expect(engine.state.champSelect!.candidates.find((c) => c.championId === 54)!.patchChange).toBeUndefined();
    delete PATCHES[0].champions.Leona;
    delete engine.state.data.clientPatch;

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
    // contexte pris avant la capture : toujours valable tant que rien n'a changé
    const ctx = engine.readContext();
    expect(ctx).not.toBeNull();
    expect(engine.isCurrentRead(ctx)).toBe(true);
    // passage au choix suivant (niveau 7 / 11 / 15) pendant la lecture : périmée aussi
    const round = engine.state.augRound;
    engine.state.augRound = (round ?? 0) + 1;
    expect(engine.isCurrentRead(ctx)).toBe(false);
    engine.state.augRound = round;
    expect(engine.isCurrentRead(undefined)).toBe(true); // appel sans contrôle (tests, simulations)
    expect(engine.isCurrentRead(null)).toBe(false); // rien n'était lisible au départ
    // bannière passée sans headliner reconnu : noté une fois avec les textes approchants
    engine.headlinerMissed(4, ['HARTSTEL']);
    const miss = engine.usage.events.filter((e) => e.type === 'headliner_miss');
    expect(miss.at(-1)).toMatchObject({ type: 'headliner_miss', championId: 54, scans: 4, near: ['HARTSTEL'] });
    // nom lu hors bannière : noté, jamais retenu
    const hs = HEADLINERS.find((h) => h.key === 'heartsteel')!;
    engine.headlinerLate(hs, 'Heartsteel', 121);
    expect(engine.state.headliner).toBeNull();
    expect(engine.usage.events.filter((e) => e.type === 'headliner_late').at(-1)).toMatchObject({ championId: 54, key: 'heartsteel', text: 'Heartsteel', afterS: 121, known: null });
    // un choix d'augment complet lu à l'écran : sa valeur est gardée pour la revue d'après-partie
    const panelAll = Object.values(engine.state.augments?.all ?? {}).flat().filter((a) => !a.estimated);
    const panelRows = panelAll.slice(0, 3);
    expect(panelRows).toHaveLength(3);
    const reviewIds = panelRows.map((a) => a.id);
    expect(engine.setOffered({ ids: reviewIds, names: panelRows.map((a) => a.name), rarity: null, unsure: null, misses: [] }, ctx)).toBe(true);
    // 2e tirage au même palier, sans carte commune (augment en plus K/DA) : il ne doit pas écraser le 1er
    const extraRows = panelAll.slice(3, 6);
    expect(extraRows).toHaveLength(3);
    const extraIds = extraRows.map((a) => a.id);
    expect(engine.setOffered({ ids: extraIds, names: extraRows.map((a) => a.name), rarity: null, unsure: null, misses: [] }, ctx)).toBe(true);
    // cartes Pentakill lues à l'écran → headliner de la partie, noté avec la partie
    expect(engine.setOffered({ ids: [3170, 3171, 3172], names: ['A', 'B', 'C'], rarity: null, unsure: null, misses: [] }, ctx)).toBe(true);
    expect(engine.state.headliner).toMatchObject({ key: 'pentakill', name: 'Pentakill', source: 'cartes' });
    expect(engine.state.headliner?.tips.length).toBeGreaterThan(0);
    engine.headlinerMissed(2, []); // headliner déjà connu : rien de noté
    // conseiller de reroll, sur un tirage à part (retiré de la revue de la partie)
    const offersBefore = new Map((engine as unknown as { offersThisGame: Map<string, unknown> }).offersThisGame);
    const golds = [...(engine.state.augments?.all?.kGold ?? [])].sort((a, b) => b.winrate - a.winrate);
    expect(golds.length).toBeGreaterThanOrEqual(5);
    const pick = (i: number[]) => ({ ids: i.map((n) => golds[n].id), names: i.map((n) => golds[n].name), rarity: 'kGold' as const, unsure: null, misses: [] });
    engine.state.headliner = null;
    engine.setOffered(pick([2, 3, 4]), ctx);
    const first = engine.state.offered?.reroll;
    expect(first).toMatchObject({ kind: 'free', upgrade: false, left: 3 });
    expect(first?.targets).not.toContain(golds[2].id);
    expect(engine.usage.events.filter((e) => e.type === 'cards_seen').at(-1)).toMatchObject({ rarity: 'kGold', reroll: { kind: 'free' } });
    // une carte relancée n'a plus de relance et ne revient pas dans le pool
    const target = first!.targets[0];
    const after = [2, 3, 4].map((n) => (golds[n].id === target ? 1 : n));
    engine.setOffered(pick(after), ctx);
    const second = engine.state.offered?.reroll;
    expect(second?.left).toBe(2);
    expect(second?.targets).not.toContain(golds[1].id);
    // revue des relances : le tirage garde ses lectures et son pool, et sa carte la plus forte relancée se note
    const draw = (engine as unknown as { draw: { steps: { id: number }[][]; pool?: number[]; upgraded?: number[] | null } }).draw;
    expect(draw.steps.map((s) => s.map((c) => c.id))).toEqual([[2, 3, 4].map((n) => golds[n].id), after.map((n) => golds[n].id)]);
    expect(draw.pool?.length).toBeGreaterThanOrEqual(8);
    expect(draw.upgraded).toBeNull();
    // lecture partielle : aucun conseil, et le suivi du tirage reste en place
    engine.setOffered({ ...pick(after), unsure: 'lecture partielle' }, ctx);
    expect(engine.state.offered?.reroll).toBeNull();
    engine.setOffered(pick(after), ctx);
    expect(engine.state.offered?.reroll?.left).toBe(2);
    // choix suivant de la même rareté : les 4 cartes déjà vues dans la partie ne reviennent pas dans le pool
    const firstPool = draw.pool!.length;
    const later = golds.slice(-3);
    expect(later.map((a) => a.id).some((id) => [1, 2, 3, 4].some((n) => golds[n].id === id))).toBe(false);
    const withInfo = engine as unknown as { augInfo: unknown };
    const realInfo = withInfo.augInfo;
    // carte que le wiki dit désactivée : hors du pool de relance
    const pool0 = (engine as unknown as { draw: { seen: Set<number> } }).draw.seen;
    const off = golds.find((g) => !pool0.has(g.id) && !later.some((a) => a.id === g.id))!;
    const melee: boolean[] = [];
    withInfo.augInfo = { size: 1, has: (n: string) => n !== later[1].name, tier: () => null, tags: () => new Set(), drawable: (n: string, m: boolean) => (melee.push(m), n !== off.name) };
    const laterRead = { ids: later.map((a) => a.id), names: later.map((a) => a.name), rarity: 'kGold' as const, unsure: null, misses: [] };
    engine.setOffered(laterRead, ctx);
    expect(melee.length).toBeGreaterThan(0);
    expect(melee.every((m) => !m)).toBe(true); // portée pas lue : on ne suppose rien
    // portée de mêlée lue en partie : le pool retire les cartes réservées aux champions à distance
    const ranged = engine as unknown as { liveRange: number };
    ranged.liveRange = 175;
    melee.length = 0;
    engine.setOffered({ ...laterRead, ids: [...laterRead.ids].reverse(), names: [...laterRead.names].reverse() }, ctx);
    expect(melee.length).toBeGreaterThan(0);
    expect(melee.every(Boolean)).toBe(true);
    ranged.liveRange = 0;
    engine.setOffered(laterRead, ctx);
    withInfo.augInfo = realInfo;
    expect((engine as unknown as { draw: { pool?: number[] } }).draw.pool?.length).toBe(firstPool - 5);
    const seenEvent = engine.usage.events.filter((e) => e.type === 'cards_seen').at(-1);
    expect(seenEvent).toMatchObject({ reroll: { pool: firstPool - 5 } });
    // cartes dont le wiki n'a pas le texte : notées, car elles n'ont aucune correction selon le build
    expect((seenEvent as unknown as { noText?: string[] }).noText).toEqual([later[1].name]);
    // un augment d'un tirage précédent lu à l'écran : lecture partielle, pas de conseil, tirage intact (Giant Slayer, 3 nov.)
    const laterIds = later.map((a) => a.id);
    engine.setOffered({ ids: [golds[2].id, laterIds[1], laterIds[2]], names: [golds[2].name, later[1].name, later[2].name], rarity: 'kGold', unsure: null, misses: [] }, ctx);
    expect(engine.state.offered).toMatchObject({ ids: laterIds.slice(1), unsure: '2 cartes sur 3 reconnues' });
    expect(engine.state.offered?.reroll).toBeNull();
    expect((engine as unknown as { draw: { ids: number[] } }).draw.ids).toEqual(laterIds);
    expect(engine.usage.events.filter((e) => e.type === 'bound_unknown')).toHaveLength(0);
    // nouveau tirage (aucune carte commune) : relances remises à zéro ; Command Line vise le cran du dessus
    engine.state.headliner = { key: 'commandline', name: 'Command Line', source: 'écran', tips: [] };
    const silvers = [...(engine.state.augments?.all?.kSilver ?? [])];
    engine.setOffered({ ids: silvers.slice(-3).map((a) => a.id), names: silvers.slice(-3).map((a) => a.name), rarity: 'kSilver', unsure: null, misses: [] }, ctx);
    expect(engine.state.offered?.reroll).toMatchObject({ kind: 'free', upgrade: true, left: 3 });
    expect(engine.state.offered?.reroll?.targets).toHaveLength(1);
    // cartes de headliner : pas de relance à conseiller
    engine.setOffered({ ids: [3170, 3171, 3172], names: ['A', 'B', 'C'], rarity: 'kGold', unsure: null, misses: [] }, ctx);
    expect(engine.state.offered?.reroll).toBeNull();
    engine.state.headliner = { key: 'pentakill', name: 'Pentakill', source: 'cartes', tips: ['x'] };
    (engine as unknown as { offersThisGame: Map<string, unknown> }).offersThisGame = offersBefore;
    expect(engine.usage.events.filter((e) => e.type === 'headliner_miss')).toHaveLength(miss.length);
    engine.setOffered(null);
    mock.state.phase = 'EndOfGame';
    mock.state.eogGameId = 77;
    mock.state.games[77] = game(77, 2400, 54, true, [1058, reviewIds[2], extraIds[0]]);
    await engine.tick();
    // une lecture commencée pendant la partie et terminée après sa fin est jetée (ni cartes, ni télémétrie)
    expect(engine.isCurrentRead(ctx)).toBe(false);
    const seen = engine.usage.events.filter((e) => e.type === 'cards_seen').length;
    expect(engine.setOffered({ ids: [1058, 3078, 3170], names: ['A', 'B', 'C'], rarity: null, unsure: null, misses: [] }, ctx)).toBe(false);
    expect(engine.state.offered).toBeFalsy();
    expect(engine.usage.events.filter((e) => e.type === 'cards_seen').length).toBe(seen);
    expect(engine.state.stats.total).toBe(3);
    expect(engine.state.stats.recent[0].gameId).toBe(77);
    expect(existsSync(join(dataDir, 'history.json'))).toBe(true);
    expect(engine.rawHistory().find((g) => g.gameId === 77)?.headliner).toBe('pentakill');
    expect(engine.getHistory().find((g) => g.gameId === 77)?.headliner).toBe('Pentakill');
    // revue : seul le choix d'augment est noté (les cartes du headliner n'ont pas de stats), et elle reste avec la partie
    const review = engine.getHistory().find((g) => g.gameId === 77)?.review;
    expect(review?.choices).toHaveLength(2);
    expect(review?.choices[0]).toMatchObject({ picked: reviewIds[2] });
    expect(review?.choices[1]).toMatchObject({ picked: extraIds[0], choice: 1 });
    const picks = engine.usage.events.filter((e) => e.type === 'card_picked' && e.gameId === 77);
    expect(picks.map((e) => (e as { picked: number }).picked)).toEqual(expect.arrayContaining([reviewIds[2], extraIds[0]]));
    expect(review?.choices[0].verdict).not.toBe('unknown');
    expect(review?.approx).toBeUndefined();
    expect(JSON.parse(readFileSync(join(dataDir, 'history.json'), 'utf8')).games.find((g: { gameId: number }) => g.gameId === 77).review.analysed).toBe(2);
    // ancienne partie (avant la revue) : notée après coup depuis usage.json, une seule fois
    const panel3 = await engine.championAugments(157);
    const old = Object.values(panel3?.all ?? {}).flat().slice(0, 3).map((a) => a.id);
    expect(old).toHaveLength(3);
    engine.usage.add({ type: 'card_picked', at: 1, gameId: 3, round: 2, ids: old, best: old[0], picked: old[1], followed: false, win: false });
    await expect(engine.backfillReviews()).resolves.toBe(1);
    const backfilled = engine.getHistory().find((g) => g.gameId === 3)?.review;
    expect(backfilled).toMatchObject({ approx: true, analysed: 1 });
    expect(engine.state.reviews).toBe(1);
    await expect(engine.backfillReviews()).resolves.toBe(0);
    // achats d'avant la v1.64 : retrouvés par champion et date, notés une seule fois, sans raison du conseil
    const g3 = engine.rawHistory().find((g) => g.gameId === 3)!;
    engine.usage.add({ type: 'item_bought', at: g3.createdAt + 60_000, championId: 157, id: 123430, reco: 6333, plan: [6333, 3065], followed: false });
    await expect(engine.backfillReviews()).resolves.toBe(1);
    const oldBuys = engine.getHistory().find((g) => g.gameId === 3)?.buys;
    expect(oldBuys?.approx).toBe(true);
    expect(oldBuys?.lines[0]).toMatchObject({ id: 123430, value: 0.6361, recoValue: 0.6053, verdict: 'close' });
    await expect(engine.backfillReviews()).resolves.toBe(0);
    // partie d'avant la v1.66 : ses relances sont reprises une seule fois depuis cards_seen, revue d'origine intacte
    const golds3 = [...(panel3?.all?.kGold ?? [])].sort((a, b) => b.winrate - a.winrate);
    expect(golds3.length).toBeGreaterThanOrEqual(6);
    const [t, u, v, w, x] = [0, 1, 2, 3, 4].map((i) => golds3[golds3.length - 1 - i].id).reverse();
    const start = g3.createdAt + 300_000;
    const seenAt = (at: number, ids: number[]) => engine.usage.add({ type: 'cards_seen', at, championId: 157, round: 3, ids, best: ids[0], unsure: false });
    seenAt(start, [t, u, v]);
    seenAt(start + 3000, [w, u, v]);
    seenAt(start + 6000, [w, x, v]);
    const end = g3.createdAt + 2_000_000;
    engine.usage.add({ type: 'card_picked', at: end, gameId: 3, round: 3, ids: [w, x, v], best: w, picked: w, followed: true, win: false });
    const stored = engine.rawHistory().find((g) => g.gameId === 3)!;
    stored.review = reviewGame([reviewChoice(3, [], w)], true)!;
    await engine.backfillReviews();
    const again = engine.getHistory().find((g) => g.gameId === 3)?.review;
    expect(again).toMatchObject({ rerollsDone: true, rerollsApprox: true });
    await expect(engine.backfillReviews()).resolves.toBe(0);
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
    expect(engine.rawHistory().find((g) => g.gameId === 88)?.headliner).toBeUndefined(); // remis à zéro au champ select
  });

  it('retrouve ton champion si l’app est lancée en pleine partie', async () => {
    const fresh = new Engine({
      dataDir: mkdtempSync(join(tmpdir(), 'aram-companion-')),
      discover: async () => ({ port: mock.port, token: mock.token }),
      arammeta: new Arammeta(join(dataDir, 'cache2'), fixtureFetcher),
      balance: offlineBalance(),
      augInfoFetcher: async () => { throw new Error('hors ligne'); },
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
      augInfoFetcher: async () => { throw new Error('hors ligne'); },
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
    // Superfans : niveau 21, plus de nouveau palier ; le lecteur de cartes se réveille sur `liveLevel`
    const liveMe = (mock.state as unknown as { live: { me: { level: number } } }).live.me;
    liveMe.level = 21;
    await fresh.tick();
    expect(fresh.state.augRound).toBe(4);
    expect(fresh.state.liveLevel).toBe(21);
    liveMe.level = 12;
    await fresh.tick();
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
