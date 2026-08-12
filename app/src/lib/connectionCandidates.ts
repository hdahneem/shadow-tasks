import type { ConnectionType } from '../store/useConnectionStore';

export interface CandidateSpec {
  url: string;
  type: Exclude<ConnectionType, 'unknown'>;
}

export interface Candidate extends CandidateSpec {
  origin: string;
  /** Set on a failed attempt so it's deprioritized (not disqualified) for a
   * short window, instead of being retried first on every single request. */
  lastFailedAt: number | null;
}

/** Drops later specs that resolve to an origin already claimed by an earlier
 * one — e.g. desktop dev where Wi-Fi and USB URLs are both localhost, so
 * there's really only one candidate and the fallback logic (and the
 * indicator that depends on candidateCount) should treat it as such. */
export function buildCandidates(specs: CandidateSpec[]): Candidate[] {
  const seenOrigins = new Set<string>();
  return specs
    .filter((s) => {
      const origin = new URL(s.url).origin;
      if (seenOrigins.has(origin)) return false;
      seenOrigins.add(origin);
      return true;
    })
    .map((s) => ({ ...s, origin: new URL(s.url).origin, lastFailedAt: null }));
}

/** Freshest-first: candidates that haven't failed recently, in their original
 * (priority) order, followed by recently-failed ones as a last resort — so a
 * request keeps trying the primary connection instead of getting stuck on
 * whichever candidate happened to work once, while not hammering a dead one. */
export function orderCandidates(candidates: Candidate[], now: number, cooldownMs: number): Candidate[] {
  const isFresh = (c: Candidate) => c.lastFailedAt === null || now - c.lastFailedAt > cooldownMs;
  return [...candidates.filter(isFresh), ...candidates.filter((c) => !isFresh(c))];
}
