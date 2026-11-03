import { afterEach, describe, expect, it, vi } from 'vitest';
import { summarizeSchema } from '../scripts/intelligence-probe';
import { collectIntelligenceDiagnostic, type DiagnosticDependencies } from '../src/core/intelligence/diagnostic';
import { intelligenceFixture } from './intelligence-fixture';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('diagnostic local : métadonnées des interfaces uniquement', () => {
  it('décrit les routes et propriétés OpenAPI sans diffuser exemples ou descriptions', () => {
    const result = summarizeSchema({
      paths: { '/liveclientdata/eventdata': {}, '/players/123/position': {}, '/unrelated': {} },
      components: { schemas: { Player: { properties: { summonerName: { example: 'PRIVATE_PLAYER' }, position: { description: 'PRIVATE_DESCRIPTION' } } } } },
    });
    expect(result.candidatePaths).toEqual(['/liveclientdata/eventdata']);
    expect(result.schemas).toEqual([{ name: 'Player', fields: ['position', 'summonerName'] }]);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_/);
  });

  it('inspecte les fonctions LCU /help sans publier leurs valeurs', () => {
    const result = summarizeSchema({ functions: [{ url: '/lol-gameflow/v1/session', token: 'PRIVATE_TOKEN' }, { url: '/event?token=PRIVATE_QUERY' }] });
    expect(result.candidatePaths).toEqual(['/lol-gameflow/v1/session']);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_/);
    expect(summarizeSchema(null).candidatePaths).toEqual([]);
  });

  it('signale la troncature des propriétés au lieu de présenter un schéma partiel comme complet', () => {
    const properties = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`field${i}`, {}]));
    const result = summarizeSchema({ components: { schemas: { Player: { properties } } } });
    expect(result.schemas[0].fields).toHaveLength(100);
    expect(result.truncated).toBe(true);
  });
});

describe('collecte ponctuelle réutilisable par Electron', () => {
  it('acquiert le roster sans exporter les joueurs, événements, secrets ou descriptions', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const request = vi.fn<DiagnosticDependencies['request']>(async (_port, _method, path) => {
      if (path === '/liveclientdata/allgamedata') return { status: 200, data: intelligenceFixture() };
      if (path === '/help') return { status: 200, data: { functions: [{ url: '/lol-gameflow/v1/session', token: 'PRIVATE_TOKEN' }] } };
      return { status: 200, data: { paths: { '/liveclientdata/eventdata': { example: 'PRIVATE_EXAMPLE' } } } };
    });
    const report = await collectIntelligenceDiagnostic({
      request, discover: async () => ({ port: 54321, token: 'PRIVATE_TOKEN' }),
    });
    expect(report.status).toBe('live-acquisition-verified');
    expect(report.live.acquisitionStatus).toBe('connected');
    expect(report.live.fields).toContain('allPlayers[].summonerSpells');
    expect(report.capabilities.reportedEvents).toBe('field-present');
    expect('enemySpellCasts' in report.capabilities).toBe(false);
    expect(report.capabilities.enemyCoordinates).toBe('unvalidated');
    expect(report.lcu.status).toBe('received');
    expect(report.liveSchema.swaggerFallback).toBeUndefined();
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/PRIVATE_|Celian|Enemy0|ChampionKill|DragonKill/);
    expect(JSON.parse(serialized)).toEqual(report);
    expect(log).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(4);
    expect(request.mock.calls.every(([, method, , options]) => method === 'GET' && options.host === '127.0.0.1')).toBe(true);
    const authenticated = request.mock.calls.filter(([, , , options]) => options.token !== undefined);
    expect(authenticated).toHaveLength(1);
    expect(authenticated[0][2]).toBe('/help');
  });

  it('essaie Swagger v2 une seule fois et distingue schéma accessible et acquisition réelle', async () => {
    const request = vi.fn<DiagnosticDependencies['request']>(async (_port, _method, path) => ({
      status: path === '/swagger/v3/openapi.json' || path === '/liveclientdata/allgamedata' ? 404 : 200,
      data: { paths: { '/liveclientdata/allgamedata': {} } },
    }));
    const report = await collectIntelligenceDiagnostic({ request, discover: async () => null });
    expect(report.status).toBe('live-acquisition-unavailable');
    expect(report.liveSchema.swaggerFallback?.status).toBe(200);
    expect(report.replay.status).toBe(200);
    expect(report.capabilities.liveRoster).toBe('unavailable');
    expect(report.capabilities.enemyCoordinates).toBe('unvalidated');
    expect(request.mock.calls.filter(([, , path]) => path === '/swagger/v2/swagger.json')).toHaveLength(1);
  });

  it('refuse un hôte LCU externe avant toute transmission du jeton', async () => {
    const request = vi.fn<DiagnosticDependencies['request']>(async () => ({ status: 0, data: null }));
    const report = await collectIntelligenceDiagnostic({
      request, discover: async () => ({ port: 12345, token: 'PRIVATE_TOKEN', host: 'example.com' }),
    });
    expect(report.lcu.status).toBe('non-loopback-rejected');
    expect(request.mock.calls.every(([port, , , options]) => port !== 12345 && options.token === undefined)).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE_|example\.com/);
  });

  it('ne valide pas une réponse 200 au roster illisible', async () => {
    const report = await collectIntelligenceDiagnostic({
      request: async () => ({ status: 200, data: { allPlayers: [{ riotId: 'PRIVATE_PLAYER' }], gameData: { gameTime: 12 } } }),
      discover: async () => null,
    });
    expect(report.live.status).toBe(200);
    expect(report.live.acquisitionStatus).toBe('invalid');
    expect(report.status).toBe('live-acquisition-unavailable');
    expect(JSON.stringify(report)).not.toContain('PRIVATE_PLAYER');
  });

  it('absorbe les erreurs de transport sans publier leur contenu authentifié', async () => {
    const report = await collectIntelligenceDiagnostic({
      request: async () => { throw new Error('PRIVATE_REQUEST Authorization=PRIVATE_TOKEN'); },
      discover: async () => { throw new Error('PRIVATE_DISCOVERY'); },
    });
    expect(report.status).toBe('live-acquisition-unavailable');
    expect(report.live.status).toBe(0);
    expect(report.lcu.status).toBe('not-discovered');
    expect(JSON.stringify(report)).not.toContain('PRIVATE_');
  });

  it('termine une collecte même si un transport ou une découverte ne répond jamais', async () => {
    vi.useFakeTimers();
    const collecting = collectIntelligenceDiagnostic({
      request: () => new Promise(() => {}),
      discover: () => new Promise(() => {}),
    });
    await vi.advanceTimersByTimeAsync(5100);
    const report = await collecting;
    expect(report.status).toBe('live-acquisition-unavailable');
    expect(report.liveSchema.swaggerFallback?.status).toBe(0);
    expect(report.lcu.status).toBe('not-discovered');
    expect(vi.getTimerCount()).toBe(0);
  });
});
