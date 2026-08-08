import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useStore } from '../store/useStore';
import { tasksApi } from '../api/services';
import { decideReconciliation } from '../lib/reconcile';
import { useIsOnline } from '../lib/useIsOnline';
import { isNative } from '../native';
import { toast } from '../store/useToastStore';
import { errorMessage } from '../api/client';
import { SyncConflictModal } from './SyncConflictModal';

const MIN_CHECK_INTERVAL_MS = 60_000;

/**
 * Always-mounted (outside the auth-gated router, alongside ToastContainer in
 * App.tsx) so it can pick up a conflict the moment connectivity returns, even
 * before AppShell/loadAll has resolved. Owns the offline indicator, the
 * online/app-resume reconciliation triggers, and the conflict modal.
 */
export function SyncManager() {
  const authenticated = useAuthStore((s) => s.status === 'authenticated');
  const online = useIsOnline();
  const pendingCount = useStore((s) => s.pendingOps.length);
  const [conflict, setConflict] = useState<{ localChangedAt: number; serverChangedAt: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const lastCheckRef = useRef(0);

  const maybeReconcile = async (force = false) => {
    if (useAuthStore.getState().status !== 'authenticated' || !navigator.onLine) return;
    const now = Date.now();
    if (!force && now - lastCheckRef.current < MIN_CHECK_INTERVAL_MS) return;
    lastCheckRef.current = now;

    const { pendingOps, lastSyncSignature, loadAll, replayPendingOps, recordSyncSignature } = useStore.getState();
    try {
      const current = await tasksApi.syncStatus();
      const decision = decideReconciliation(pendingOps, lastSyncSignature, current);
      if (decision.kind === 'silent-refresh') {
        await loadAll();
        recordSyncSignature(current);
      } else if (decision.kind === 'auto-replay') {
        await replayPendingOps();
        await loadAll();
        recordSyncSignature(current);
      } else {
        setConflict({ localChangedAt: decision.localChangedAt, serverChangedAt: decision.serverChangedAt });
      }
    } catch {
      // a failed reconciliation check just means "try again next trigger" — this is
      // a background connectivity probe, not a user-initiated action worth a toast.
    }
  };

  useEffect(() => {
    if (!authenticated) return;
    const onOnline = () => {
      maybeReconcile(true);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated || !isNative) return;
    let remove: (() => void) | undefined;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) maybeReconcile();
        });
        remove = () => handle.remove();
      } catch {
        // native plugin unavailable (e.g. running in a browser) — online/offline
        // events above still cover the reconnect case.
      }
    })();
    return () => remove?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  useEffect(() => {
    // Also check once on login/mount, in case we're already online with a stale
    // queue left over from a previous session that never got to reconcile.
    if (authenticated) maybeReconcile(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  const resolveConflict = async (direction: 'phone' | 'desktop') => {
    setBusy(true);
    try {
      const { loadAll, replayPendingOps, discardPendingOps, recordSyncSignature } = useStore.getState();
      if (direction === 'phone') {
        await replayPendingOps();
      } else {
        discardPendingOps();
      }
      await loadAll();
      const current = await tasksApi.syncStatus();
      recordSyncSignature(current);
      setConflict(null);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not finish syncing. Try again once you have a connection.'));
    } finally {
      setBusy(false);
    }
  };

  if (!authenticated) return null;

  return (
    <>
      {!online && (
        <div className="fixed bottom-4 left-4 z-[90] px-3 py-1.5 border border-cyan-dim/40 bg-panel/95 backdrop-blur-sm font-body text-xs text-mist uppercase tracking-wider">
          Offline{pendingCount > 0 ? ` — ${pendingCount} change${pendingCount === 1 ? '' : 's'} pending` : ''}
        </div>
      )}
      {conflict && (
        <SyncConflictModal
          localChangedAt={conflict.localChangedAt}
          serverChangedAt={conflict.serverChangedAt}
          busy={busy}
          onKeepPhone={() => resolveConflict('phone')}
          onKeepDesktop={() => resolveConflict('desktop')}
          onClose={() => setConflict(null)}
        />
      )}
    </>
  );
}
