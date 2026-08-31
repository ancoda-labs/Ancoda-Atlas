import { createHmac } from 'crypto';

interface Bucket {
  turns: number;
  tokens: number;
  windowStart: number;
}

interface LimitGlobal {
  __atlasAskSandbox?: { byKey: Map<string, Bucket>; global: Bucket };
}

const HOUR = 60 * 60 * 1000;

function maxTurns(): number {
  const n = Number(process.env.ASK_SANDBOX_MAX_TURNS_PER_HOUR);
  return Number.isFinite(n) && n > 0 ? n : 12;
}

function maxGlobal(): number {
  const n = Number(process.env.ASK_SANDBOX_MAX_GLOBAL_TURNS_PER_HOUR);
  return Number.isFinite(n) && n > 0 ? n : 80;
}

function maxOutputTokens(): number {
  const n = Number(process.env.ASK_SANDBOX_MAX_OUTPUT_TOKENS);
  return Number.isFinite(n) && n >= 64 ? n : 500;
}

function store() {
  const g = globalThis as unknown as LimitGlobal;
  if (!g.__atlasAskSandbox) {
    g.__atlasAskSandbox = { byKey: new Map(), global: { turns: 0, tokens: 0, windowStart: Date.now() } };
  }
  return g.__atlasAskSandbox;
}

function roll(bucket: Bucket): Bucket {
  if (Date.now() - bucket.windowStart >= HOUR) {
    return { turns: 0, tokens: 0, windowStart: Date.now() };
  }
  return bucket;
}

export function hashAskClient(ip: string): string {
  const salt = process.env.ATLAS_IP_SALT || 'atlas-ask-sandbox';
  return createHmac('sha256', salt).update(ip).digest('hex').slice(0, 32);
}

export function remainingFor(key: string): { hour: number; globalHour: number } {
  const s = store();
  const local = roll(s.byKey.get(key) || { turns: 0, tokens: 0, windowStart: Date.now() });
  s.byKey.set(key, local);
  s.global = roll(s.global);
  return {
    hour: Math.max(0, maxTurns() - local.turns),
    globalHour: Math.max(0, maxGlobal() - s.global.turns),
  };
}

export function canSpend(key: string): boolean {
  const r = remainingFor(key);
  return r.hour > 0 && r.globalHour > 0;
}

export function recordTurn(key: string, outputTokens: number): void {
  const s = store();
  const local = roll(s.byKey.get(key) || { turns: 0, tokens: 0, windowStart: Date.now() });
  local.turns += 1;
  local.tokens += outputTokens;
  s.byKey.set(key, local);
  s.global = roll(s.global);
  s.global.turns += 1;
  s.global.tokens += outputTokens;
}

export { maxOutputTokens };
