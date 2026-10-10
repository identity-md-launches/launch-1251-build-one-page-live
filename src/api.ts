export const REFRESH_INTERVAL_MS = 30_000;
export const REQUEST_TIMEOUT_MS = 12_000;
export const SWARM_URL = 'https://api.imd.fun/swarm';
export const ORACLES_URL = 'https://api.imd.fun/oracle/requests?limit=10';

export type Health = {
  agentsOnline: number;
  workingNow: number;
  jobsDoneLastDay: number;
  oraclesDoneLastDay: number;
  acceptedLastDay: number;
  verifierUp: boolean;
  publisherUp: boolean;
  deployerUp: boolean;
};

export type OracleQuestion = {
  id: string;
  question: string;
  status: string;
  chainId: number;
  attestedAt: string | null;
};

export type Snapshot = {
  health: Health;
  questions: OracleQuestion[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parseHealth(payload: unknown): Health {
  if (!isRecord(payload) || !isRecord(payload.health)) {
    throw new Error('Missing network health');
  }
  const health = payload.health;
  const counts = ['agentsOnline', 'workingNow', 'jobsDoneLastDay', 'oraclesDoneLastDay', 'acceptedLastDay'] as const;
  const flags = ['verifierUp', 'publisherUp', 'deployerUp'] as const;
  if (health.reachable === false || !counts.every((key) => isCount(health[key])) ||
    !flags.every((key) => typeof health[key] === 'boolean')) {
    throw new Error('Invalid network health');
  }
  return {
    agentsOnline: health.agentsOnline as number,
    workingNow: health.workingNow as number,
    jobsDoneLastDay: health.jobsDoneLastDay as number,
    oraclesDoneLastDay: health.oraclesDoneLastDay as number,
    acceptedLastDay: health.acceptedLastDay as number,
    verifierUp: health.verifierUp as boolean,
    publisherUp: health.publisherUp as boolean,
    deployerUp: health.deployerUp as boolean,
  };
}

export function parseQuestions(payload: unknown): OracleQuestion[] {
  if (!isRecord(payload) || !Array.isArray(payload.requests)) {
    throw new Error('Missing oracle requests');
  }
  // The endpoint supplies newest-first request order. Attestation order differs,
  // and sorting by it would incorrectly hide recent, not-yet-attested requests.
  const seen = new Set<string>();
  return payload.requests.slice(0, 10).map((item: unknown) => {
    if (!isRecord(item) || !nonEmpty(item.id) || seen.has(item.id) ||
      !nonEmpty(item.question) || !nonEmpty(item.status) || !isCount(item.chainId) ||
      !(item.attestedAt === null || (typeof item.attestedAt === 'string' &&
        Number.isFinite(Date.parse(item.attestedAt))))) {
      throw new Error('Invalid oracle request');
    }
    seen.add(item.id);
    return {
      id: item.id,
      question: item.question,
      status: item.status,
      chainId: item.chainId,
      attestedAt: item.attestedAt,
    };
  });
}

async function readJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    signal,
    cache: 'no-store',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Network response: ${response.status}`);
  return response.json();
}

export async function fetchSnapshot(signal: AbortSignal): Promise<Snapshot> {
  const [swarm, oracles] = await Promise.all([
    readJson(SWARM_URL, signal),
    readJson(ORACLES_URL, signal),
  ]);
  return { health: parseHealth(swarm), questions: parseQuestions(oracles) };
}

export function chainName(chainId: number): string {
  const names: Record<number, string> = { 1: 'Ethereum', 8453: 'Base', 4663: 'Robinhood Chain' };
  return names[chainId] ?? `Chain ${chainId}`;
}

export function attestationAge(attestedAt: string, now: number): string {
  const seconds = Math.floor((now - Date.parse(attestedAt)) / 1_000);
  if (seconds < 0) return 'Attested · check clock';
  if (seconds < 60) return `Attested ${seconds}s ago`;
  if (seconds < 3_600) return `Attested ${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `Attested ${Math.floor(seconds / 3_600)}h ago`;
  return `Attested ${Math.floor(seconds / 86_400)}d ago`;
}
