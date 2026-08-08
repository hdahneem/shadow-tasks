import { describe, it, expect } from 'vitest';
import { decideReconciliation } from './reconcile';
import type { PendingOp } from '../store/offlineQueue';
import type { SyncStatus } from '../types';

const op = (overrides: Partial<PendingOp> = {}): PendingOp =>
  ({ id: 'op1', kind: 'toggleDone', taskId: 't1', done: true, createdAt: 1000, ...overrides }) as PendingOp;

describe('decideReconciliation', () => {
  it('returns silent-refresh when there are no pending ops, regardless of server state', () => {
    const server: SyncStatus = { lastModifiedAt: '2026-08-07T00:00:00.000Z', count: 5 };
    expect(decideReconciliation([], null, server)).toEqual({ kind: 'silent-refresh' });
    expect(decideReconciliation([], { lastModifiedAt: null, count: 0 }, server)).toEqual({ kind: 'silent-refresh' });
  });

  it('returns auto-replay when there are pending ops but the server signature has not moved', () => {
    const signature: SyncStatus = { lastModifiedAt: '2026-08-07T00:00:00.000Z', count: 3 };
    const decision = decideReconciliation([op()], signature, { ...signature });
    expect(decision).toEqual({ kind: 'auto-replay' });
  });

  it('returns conflict when pending ops exist and the server count has changed', () => {
    const last: SyncStatus = { lastModifiedAt: '2026-08-07T00:00:00.000Z', count: 3 };
    const current: SyncStatus = { lastModifiedAt: '2026-08-07T00:00:00.000Z', count: 4 };
    const decision = decideReconciliation([op({ createdAt: 5000 })], last, current);
    expect(decision).toMatchObject({ kind: 'conflict', localChangedAt: 5000, serverChangedAt: current.lastModifiedAt });
  });

  it('returns conflict when pending ops exist and lastModifiedAt has moved even if count is the same', () => {
    const last: SyncStatus = { lastModifiedAt: '2026-08-07T00:00:00.000Z', count: 3 };
    const current: SyncStatus = { lastModifiedAt: '2026-08-07T01:00:00.000Z', count: 3 };
    const decision = decideReconciliation([op()], last, current);
    expect(decision.kind).toBe('conflict');
  });

  it('treats a null lastSyncSignature (never synced before) as a conflict when ops are pending', () => {
    const current: SyncStatus = { lastModifiedAt: '2026-08-07T00:00:00.000Z', count: 1 };
    const decision = decideReconciliation([op()], null, current);
    expect(decision.kind).toBe('conflict');
  });

  it('reports the most recent op timestamp as localChangedAt when multiple ops are queued', () => {
    const last: SyncStatus = { lastModifiedAt: null, count: 0 };
    const current: SyncStatus = { lastModifiedAt: '2026-08-07T00:00:00.000Z', count: 1 };
    const decision = decideReconciliation(
      [op({ createdAt: 1000 }), op({ id: 'op2', createdAt: 9000 }), op({ id: 'op3', createdAt: 4000 })],
      last,
      current
    );
    expect(decision).toMatchObject({ kind: 'conflict', localChangedAt: 9000 });
  });
});
