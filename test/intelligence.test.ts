import { describe, expect, it } from 'vitest';
import { GameDataAcquisitionEngine, normalizeLiveSnapshot } from '../src/core/intelligence/acquisition';
import { RealTimeIntelligenceStore } from '../src/core/intelligence/store';

/** Réponse synthétique documentée : teste le traitement, pas une acquisition en vraie partie. */
function payload(gameTime = 120) {
  return {
    activePlayer: { riotId: 'Moi#EUW', summonerName: 'Moi' },
    gameData: { gameTime },
    allPlayers: [
      { riotId: 'Moi#EUW', summonerName: 'Moi', championName: 'Leona', rawChampionName: 'game_character_displayname_Leona', team: 'ORDER', level: 8 },
      { riotId: 'Ennemi#EUW', summonerName: 'Ennemi', championName: 'Ahri', rawChampionName: 'game_character_displayname_Ahri', team: 'CHAOS', level: 9, isDead: false,
        position: 'MIDDLE', summonerSpells: { summonerSpellOne: { displayName: 'Flash' }, summonerSpellTwo: { displayName: 'Ignite' } } },
    ],
    events: { Events: [{ EventID: 7, EventName: 'ChampionKill', EventTime: 110, KillerName: 'Ennemi', VictimName: 'Moi' }] },
  };
}

const read = (raw: unknown) => new GameDataAcquisitionEngine({ read: async () => ({ status: 200, data: raw }) }).poll();

describe('acquisition Live Client et état ennemi', () => {
  it('normalise le roster, les sorts équipés et les événements sans inventer de positions ou timers', async () => {
    const store = new RealTimeIntelligenceStore();
    const result = await read(payload());
    const state = store.update(result, { sessionId: '42', championId: (alias) => alias === 'Ahri' ? 103 : null });
    expect(state.sourceStatus).toBe('connected');
    expect(state.gameTime).toBe(120);
    expect(state.enemies).toHaveLength(1);
    expect(state.enemies[0]).toMatchObject({ championName: 'Ahri', championId: 103, level: 9, isDead: false, visibility: 'unknown', movement: 'unknown', position: { quality: 'unknown', x: null, y: null } });
    // Sorts d'invocateur équipés seulement (ce que montre le tableau des scores), aucun cooldown ennemi
    expect(state.enemies[0].spells).toEqual([{ slot: 'D', name: 'Flash' }, { slot: 'F', name: 'Ignite' }]);
    expect(state.enemies[0].lastEvent).toMatchObject({ id: 7, gameTime: 110, enemyIds: ['Ennemi#EUW'], quality: 'exact', visibility: 'unknown' });
    expect(result.diagnostic.fields).toContain('allPlayers[].position');
    expect(result.diagnostic.fields.join(' ')).not.toContain('Moi#EUW');
    expect(state.capabilities.map((c) => c.id)).not.toContain('cooldowns');
  });

  it('déduplique le journal cumulatif et ne transforme pas un champ SpellCast en lancement acquis', async () => {
    const store = new RealTimeIntelligenceStore();
    const raw = payload();
    raw.events.Events.push({ EventID: 8, EventName: 'SpellCast', EventTime: 115, KillerName: 'Ennemi', VictimName: '' });
    store.update(await read(raw));
    const state = store.update(await read(raw));
    expect(state.events).toHaveLength(2);
    expect(state.enemies[0].spells.every((s) => !('remainingSeconds' in s))).toBe(true);
  });

  it('refuse une équipe active inconnue ou une identité ambiguë', async () => {
    const store = new RealTimeIntelligenceStore();
    const raw = payload();
    raw.activePlayer.riotId = 'Absent#EUW';
    raw.activePlayer.summonerName = 'Absent';
    expect(store.update(await read(raw)).enemies).toEqual([]);
    raw.activePlayer.summonerName = 'Commun';
    raw.allPlayers[0].summonerName = 'Commun';
    raw.allPlayers[1].summonerName = 'Commun';
    expect(store.update(await read(raw)).enemies).toEqual([]);
  });

  it('n’attribue pas un événement à un joueur dont le nom partagé est ambigu', async () => {
    const raw = payload();
    raw.allPlayers[0].summonerName = 'Commun';
    raw.allPlayers[1].summonerName = 'Commun';
    raw.events.Events[0].KillerName = 'Commun';
    raw.events.Events[0].VictimName = '';
    // L'identité active par Riot ID est suffisante si aucun alias actif faible ne crée d'ambiguïté.
    raw.activePlayer.summonerName = 'Moi';
    const state = new RealTimeIntelligenceStore().update(await read(raw));
    expect(state.enemies).toHaveLength(1);
    expect(state.events[0].enemyIds).toEqual([]);
  });

  it('recorrèle l’historique quand l’identité arrive après les événements et déduplique les flux partiels', async () => {
    const store = new RealTimeIntelligenceStore();
    const raw = payload();
    raw.activePlayer.riotId = 'Absent#EUW';
    raw.activePlayer.summonerName = 'Absent';
    expect(store.update(await read(raw)).events[0].enemyIds).toEqual([]);
    raw.activePlayer.riotId = 'Moi#EUW';
    expect(store.update(await read(raw)).events[0].enemyIds).toEqual(['Ennemi#EUW']);
    const events = raw.events.Events;
    raw.events.Events = [];
    store.update(await read(raw));
    raw.events.Events = events;
    expect(store.update(await read(raw)).events).toHaveLength(1);
  });

  it('privilégie le Riot ID complet même si le nom sans tag est partagé', async () => {
    const raw = payload();
    raw.activePlayer.summonerName = 'Commun';
    raw.allPlayers[0].summonerName = 'Commun';
    raw.allPlayers[1].summonerName = 'Commun';
    expect(new RealTimeIntelligenceStore().update(await read(raw)).enemies).toHaveLength(1);
  });

  it('efface les observations sur changement de session ou retour en arrière de l’horloge', async () => {
    const store = new RealTimeIntelligenceStore();
    store.update(await read(payload()), { sessionId: '42' });
    const next = payload(2);
    next.events.Events = [];
    expect(store.update(await read(next), { sessionId: '43' }).events).toEqual([]);
    store.update(await read(payload(130)), { sessionId: '43' });
    expect(store.update(await read(next), { sessionId: '43' }).events).toEqual([]);
  });

  it('invalide la fraîcheur après perte de connexion sans effacer le journal historique', async () => {
    const store = new RealTimeIntelligenceStore();
    store.update(await read(payload()));
    const result = await new GameDataAcquisitionEngine({ read: async () => ({ status: 0, data: null }) }).poll();
    const state = store.update(result);
    expect(state.sourceStatus).toBe('unavailable');
    expect(state.gameTime).toBeNull();
    expect(state.enemies[0].freshness).toBe('stale');
    expect(state.events).toHaveLength(1);
    expect(state.capabilities.filter((c) => c.status !== 'unavailable')).toEqual([]);
  });

  it('efface l’ancien journal si le roster change sans identifiant LCU ou si l’horloge recule légèrement', async () => {
    const store = new RealTimeIntelligenceStore();
    store.update(await read(payload()));
    const next = payload(200);
    next.allPlayers[1].riotId = 'Autre#EUW';
    next.events.Events = [];
    expect(store.update(await read(next)).events).toEqual([]);
    store.update(await read(payload()));
    const rewind = payload(119.75);
    rewind.events.Events = [];
    expect(store.update(await read(rewind)).events).toEqual([]);
  });

  it('rejette les réponses mal formées, sans confondre HTTP 200 et acquisition valide', async () => {
    for (const raw of [null, {}, { gameData: { gameTime: NaN }, allPlayers: [] }, { ...payload(), allPlayers: [{ championName: 'Ahri' }] }]) {
      expect(normalizeLiveSnapshot(raw)).toBeNull();
      expect((await read(raw)).status).toBe('invalid');
    }
    const raw = payload();
    raw.events.Events.push({ EventID: 8, EventName: 'ChampionKill', EventTime: 300, KillerName: 'Ennemi', VictimName: '' });
    expect(normalizeLiveSnapshot(raw)?.events).toHaveLength(1);
  });

  it('conserve un état borné sur un flux cumulatif long', async () => {
    const store = new RealTimeIntelligenceStore();
    const raw = payload(1000);
    raw.events.Events = Array.from({ length: 800 }, (_, i) => ({ EventID: i, EventName: 'ChampionKill', EventTime: i, KillerName: 'Ennemi', VictimName: 'Moi' }));
    expect(store.update(await read(raw)).events).toHaveLength(200);
    const state = store.update(await read(raw));
    expect(state.events).toHaveLength(200);
    expect(state.events[0].id).toBe(600);
  });

  it('partage une requête en cours et récupère après une exception de transport', async () => {
    let resolve!: (value: { status: number; data: unknown }) => void;
    let calls = 0;
    const acquisition = new GameDataAcquisitionEngine({ read: () => { calls++; return new Promise((done) => { resolve = done; }); } });
    const first = acquisition.poll();
    const second = acquisition.poll();
    expect(first).toBe(second);
    resolve({ status: 200, data: payload() });
    await Promise.all([first, second]);
    expect(calls).toBe(1);
    let failed = true;
    const retry = new GameDataAcquisitionEngine({ read: async () => { if (failed) throw new Error('test'); return { status: 200, data: payload() }; } });
    expect((await retry.poll()).status).toBe('unavailable');
    failed = false;
    expect((await retry.poll()).status).toBe('connected');
  });
});
