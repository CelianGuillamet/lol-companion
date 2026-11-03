import { GameDataAcquisitionEngine } from './acquisition';
import { discoverCredentials, LcuClient, localRequest, type Credentials, type LcuResponse } from '../lcu';
import type { AcquisitionResult } from './types';

export interface SchemaSummary {
  topLevelFields: string[];
  candidatePaths: string[];
  schemas: { name: string; fields: string[] }[];
  truncated: boolean;
}

export interface EndpointDiagnostic {
  endpoint: string;
  status: number;
  availability: 'received' | 'unavailable';
  schema: SchemaSummary | null;
}

export interface IntelligenceDiagnosticReport {
  status: 'live-acquisition-verified' | 'live-acquisition-unavailable';
  live: {
    endpoint: '/liveclientdata/allgamedata';
    status: number;
    acquisitionStatus: AcquisitionResult['status'];
    fields: string[];
  };
  liveSchema: { openapi: EndpointDiagnostic; swaggerFallback?: EndpointDiagnostic };
  replay: EndpointDiagnostic;
  lcu: {
    status: 'received' | 'unavailable' | 'not-discovered' | 'non-loopback-rejected';
    help: EndpointDiagnostic | null;
  };
  capabilities: {
    liveRoster: 'acquired' | 'unavailable';
    gameClock: 'acquired' | 'unavailable';
    reportedEvents: 'field-present' | 'unavailable';
    enemyCoordinates: 'unvalidated';
    enemyVisibility: 'unvalidated';
    enemySpellCasts: 'unvalidated';
    enemyCooldowns: 'unvalidated';
  };
}

export interface DiagnosticDependencies {
  /** Injection de transport réservée aux tests. Les destinations de production restent locales. */
  request: (
    port: number, method: 'GET', path: string,
    options: { host: '127.0.0.1'; timeoutMs: number; token?: string },
  ) => Promise<LcuResponse<unknown>>;
  discover: () => Promise<Credentials | null>;
}

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const MAX_FIELDS = 100;
const relevant = /liveclient|spell|abilit|cooldown|cast|event|position|coordinate|vision|fog|recall|replay|gameflow|telemetry|help/i;
const MAX_PATHS = 120;
const MAX_SCHEMAS = 60;

/** Schéma uniquement : aucun champ de description, exemple ou valeur par défaut n'est publié. */
export function summarizeSchema(raw: unknown): SchemaSummary {
  const root = object(raw);
  const paths = object(root?.paths);
  const definitions = object(object(root?.components)?.schemas) ?? object(root?.definitions);
  const routes = new Set<string>();
  let inspected = 0;
  let truncated = false;
  const fieldsOf = (value: unknown) => {
    const fields = Object.keys(object(value) ?? {}).sort();
    if (fields.length > MAX_FIELDS) truncated = true;
    return fields.slice(0, MAX_FIELDS);
  };
  const addRoute = (value: unknown) => {
    if (typeof value !== 'string' || !value.startsWith('/') || value.length > 240 ||
      /[?\s#]/.test(value) || value.split('/').some((part) => /^\d+$/.test(part)) || !relevant.test(value)) return;
    routes.add(value);
  };
  if (paths) Object.keys(paths).forEach(addRoute);
  // /help décrit des fonctions. Lire leurs URL n'exige pas de publier les autres valeurs du document.
  if (!paths) {
    const visit = (value: unknown, depth: number) => {
      if (++inspected > 10_000 || depth > 10) { truncated = true; return; }
      if (Array.isArray(value)) {
        for (const entry of value) {
          if (inspected >= 10_000) { truncated = true; break; }
          visit(entry, depth + 1);
        }
        return;
      }
      for (const [key, child] of Object.entries(object(value) ?? {})) {
        if (inspected >= 10_000) { truncated = true; break; }
        addRoute(key);
        if (['url', 'path', 'endpoint'].includes(key)) addRoute(child);
        if (typeof child === 'object' && child !== null) visit(child, depth + 1);
      }
    };
    visit(raw, 0);
  }
  const selectedSchemas = Object.entries(definitions ?? {})
    .filter(([name]) => relevant.test(name) || /player|gamedata/i.test(name));
  const schemas = selectedSchemas.slice(0, MAX_SCHEMAS).map(([name, value]) => ({
    name, fields: fieldsOf(object(value)?.properties),
  }));
  const topLevelFields = fieldsOf(raw);
  return {
    topLevelFields,
    candidatePaths: [...routes].sort().slice(0, MAX_PATHS),
    schemas,
    truncated: truncated || routes.size > MAX_PATHS || selectedSchemas.length > MAX_SCHEMAS,
  };
}

/** Une erreur peut contenir une requête authentifiée : seule la valeur de repli est conservée. */
async function bounded<T>(operation: () => Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation).catch(() => fallback),
      new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const defaultRequest: DiagnosticDependencies['request'] = (port, method, path, options) =>
  options.token
    ? new LcuClient({ port, token: options.token, host: '127.0.0.1' }).request(method, path)
    : localRequest(port, method, path, options);

/**
 * Diagnostic ponctuel, en lecture seule et sérialisable pour IPC/export.
 * Aucun événement brut, identifiant de joueur ou jeton ne sort de cette fonction.
 */
export async function collectIntelligenceDiagnostic(
  dependencies: Partial<DiagnosticDependencies> = {},
): Promise<IntelligenceDiagnosticReport> {
  const transport = dependencies.request ?? defaultRequest;
  const request = (port: number, path: string, token?: string) => bounded(
    () => transport(port, 'GET', path, { host: '127.0.0.1', timeoutMs: token ? 4000 : 2000, ...(token ? { token } : {}) }),
    token ? 4500 : 2500,
    { status: 0, data: null } as LcuResponse<unknown>,
  );
  const describeLocal = async (endpoint: string, port: number): Promise<EndpointDiagnostic> => {
    const response = await request(port, endpoint);
    return {
      endpoint, status: response.status,
      availability: response.status === 200 ? 'received' : 'unavailable',
      schema: response.status === 200 ? summarizeSchema(response.data) : null,
    };
  };
  const describeLcu = async (): Promise<IntelligenceDiagnosticReport['lcu']> => {
    const creds = await bounded(dependencies.discover ?? discoverCredentials, 2000, null);
    if (!creds) return { status: 'not-discovered', help: null };
    if (creds.host && creds.host !== '127.0.0.1') return { status: 'non-loopback-rejected', help: null };
    if (!Number.isInteger(creds.port) || creds.port < 1 || creds.port > 65535 || !creds.token) {
      return { status: 'unavailable', help: null };
    }
    const response = await request(creds.port, '/help', creds.token);
    return {
      status: response.status === 200 ? 'received' : 'unavailable',
      help: {
        endpoint: '/help', status: response.status,
        availability: response.status === 200 ? 'received' : 'unavailable',
        schema: response.status === 200 ? summarizeSchema(response.data) : null,
      },
    };
  };
  const [live, openapi, replay, lcu] = await Promise.all([
    new GameDataAcquisitionEngine({ read: () => request(2999, '/liveclientdata/allgamedata') }).poll(),
    describeLocal('/swagger/v3/openapi.json', 2999),
    describeLocal('/replay/game', 2997),
    describeLcu(),
  ]);
  const acquired = live.status === 'connected';
  return {
    status: acquired ? 'live-acquisition-verified' : 'live-acquisition-unavailable',
    live: {
      endpoint: live.diagnostic.endpoint,
      status: live.diagnostic.status,
      acquisitionStatus: live.status,
      fields: live.diagnostic.fields,
    },
    liveSchema: {
      openapi,
      ...(openapi.status === 200 ? {} : { swaggerFallback: await describeLocal('/swagger/v2/swagger.json', 2999) }),
    },
    replay,
    lcu,
    capabilities: {
      liveRoster: acquired ? 'acquired' : 'unavailable',
      gameClock: acquired ? 'acquired' : 'unavailable',
      reportedEvents: live.snapshot?.eventsAvailable ? 'field-present' : 'unavailable',
      enemyCoordinates: 'unvalidated',
      enemyVisibility: 'unvalidated',
      enemySpellCasts: 'unvalidated',
      enemyCooldowns: 'unvalidated',
    },
  };
}
