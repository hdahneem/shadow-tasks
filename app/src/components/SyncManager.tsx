import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useStore } from '../store/useStore';
import { tasksApi } from '../api/services';
import { isNative } from '../native';
import { toast } from '../store/useToastStore';
import { errorMessage } from '../api/client';
import { SyncConflictModal } from './SyncConflictModal';

/**
 * Always-mounted (outside the auth-gated router, alongside ToastContainer in
 * App.tsx) so it can pick up a conflict the moment connectivity returns, even
 * before AppShell/loadAll has resolved. Owns the automatic reconciliation
 * triggers (reconnect, app-resume, mount — see useStore's triggerSync for the
 * actual reconciliation logic and its throttling) and renders the conflict
 * modal. The connection/sync status itself is SyncStatusIndicator, and manual
 * sync is also available via pull-to-refresh — both just call triggerSync too.
 */
export function SyncManager() {
  const authenticated = useAuthStore((s) => s.status === 'authenticated');
  const conflict = useStore((s) => s.syncConflict);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authenticated) return;
    const onOnline = () => {
      useStore.getState().triggerSync(true);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated || !isNative) return;
    let remove: (() => void) | undefined;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) useStore.getState().triggerSync();
        });
        remove = () => handle.remove();
      } catch {
        // native plugin unavailable (e.g. running in a browser) — online/offline
        // events above still cover the reconnect case.
      }
    })();
    return () => remove?.();
  }, [authenticated]);

  useEffect(() => {
    // Also check once on login/mount, in case we're already online with a stale
    // queue left over from a previous session that never got to reconcile.
    if (authenticated) useStore.getState().triggerSync(true);
  }, [authenticated]);

  useEffect(() => {
    // Capacitor WebViews don't reliably fire browser 'online'/'offline' events
    // on network changes (Wi-Fi dropping, a USB cable being plugged in, etc.),
    // so a failed sync could otherwise sit in the "Sync Failed" state
    // indefinitely until the user manually retries or backgrounds/foregrounds
    // the app. Retry on a short interval instead, so recovery — e.g. once the
    // USB fallback in api/client.ts becomes reachable — happens within
    // seconds rather than requiring the user to notice and act.
    if (!authenticated || !isNative) return;
    const RETRY_ON_ERROR_INTERVAL_MS = 5000;
    const interval = setInterval(() => {
      if (useStore.getState().syncState === 'error') {
        useStore.getState().triggerSync(true);
      }
    }, RETRY_ON_ERROR_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [authenticated]);

  const resolveConflict = async (direction: 'phone' | 'desktop') => {
    setBusy(true);
    try {
      const { loadAll, replayPendingOps, discardPendingOps, recordSyncSignature, dismissSyncConflict } =
        useStore.getState();
      if (direction === 'phone') {
        await replayPendingOps();
      } else {
        discardPendingOps();
      }
      await loadAll();
      const current = await tasksApi.syncStatus();
      recordSyncSignature(current);
      dismissSyncConflict();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not finish syncing. Try again once you have a connection.'));
    } finally {
      setBusy(false);
    }
  };

  if (!authenticated || !conflict) return null;

  return (
    <SyncConflictModal
      localChangedAt={conflict.localChangedAt}
      serverChangedAt={conflict.serverChangedAt}
      busy={busy}
      onKeepPhone={() => resolveConflict('phone')}
      onKeepDesktop={() => resolveConflict('desktop')}
      onClose={() => useStore.getState().dismissSyncConflict()}
    />
  );
}
