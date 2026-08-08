import type { SyncStatus } from '../types';
import type { PendingOp } from '../store/offlineQueue';

export type ReconcileDecision =
  | { kind: 'silent-refresh' }
  | { kind: 'auto-replay' }
  | { kind: 'conflict'; localChangedAt: number; serverChangedAt: string | null };

/**
 * Decides what to do when connectivity returns:
 *   - no queued local edits -> just refresh, nothing to reconcile
 *   - queued edits, but the server's signature still matches what we saw at our
 *     last clean sync -> nothing changed remotely while we were offline, safe to
 *     push our queue without asking (not a real conflict, just a delayed write)
 *   - queued edits AND the server's signature has moved -> both sides diverged,
 *     surface the conflict prompt rather than silently picking a winner
 */
export function decideReconciliation(
  pendingOps: PendingOp[],
  lastSyncSignature: SyncStatus | null,
  currentServerSignature: SyncStatus
): ReconcileDecision {
  if (pendingOps.length === 0) {
    return { kind: 'silent-refresh' };
  }

  const serverUnchangedSinceLastSync =
    lastSyncSignature !== null &&
    lastSyncSignature.count === currentServerSignature.count &&
    lastSyncSignature.lastModifiedAt === currentServerSignature.lastModifiedAt;

  if (serverUnchangedSinceLastSync) {
    return { kind: 'auto-replay' };
  }

  const localChangedAt = Math.max(...pendingOps.map((op) => op.createdAt));
  return { kind: 'conflict', localChangedAt, serverChangedAt: currentServerSignature.lastModifiedAt };
}
