import { useStore } from '../store/useStore';
import { useIsOnline } from '../lib/useIsOnline';

type DisplayState = 'synced' | 'syncing' | 'offline' | 'error';

const CYAN_GLOW = '0 0 6px 1px rgba(34,211,238,0.7)';
const DANGER_GLOW = '0 0 6px 1px rgba(244,63,94,0.7)';

const STATE_CONFIG: Record<
  DisplayState,
  { label: string; dotClass: string; textClass: string; glow: string | null; pulse: boolean }
> = {
  synced: { label: 'Synced', dotClass: 'bg-cyan', textClass: 'text-cyan-bright', glow: CYAN_GLOW, pulse: false },
  syncing: { label: 'Syncing…', dotClass: 'bg-cyan', textClass: 'text-cyan-bright', glow: CYAN_GLOW, pulse: true },
  offline: { label: 'Offline', dotClass: 'bg-mist-dim', textClass: 'text-mist-dim', glow: null, pulse: false },
  error: { label: 'Sync Failed', dotClass: 'bg-danger', textClass: 'text-danger', glow: DANGER_GLOW, pulse: false },
};

/**
 * Always-visible connection/sync status pill — synced, syncing, offline, or
 * failed (see useStore's syncState + useIsOnline). Doubles as a manual sync
 * trigger: clicking it calls the same triggerSync the pull-to-refresh gesture
 * uses, so desktop users (no pull gesture) get an equivalent "sync now" affordance.
 */
export function SyncStatusIndicator() {
  const online = useIsOnline();
  const syncState = useStore((s) => s.syncState);
  const pendingCount = useStore((s) => s.pendingOps.length);

  const state: DisplayState = !online
    ? 'offline'
    : syncState === 'error'
      ? 'error'
      : syncState === 'syncing' || pendingCount > 0
        ? 'syncing'
        : 'synced';

  const canSync = online && syncState !== 'syncing';
  const config = STATE_CONFIG[state];

  const title =
    state === 'offline'
      ? `Offline${pendingCount > 0 ? ` — ${pendingCount} change${pendingCount === 1 ? '' : 's'} pending` : ''}`
      : state === 'error'
        ? 'Sync failed — tap to retry'
        : state === 'syncing'
          ? 'Syncing with the server…'
          : 'Up to date — tap to sync now';

  return (
    <button
      type="button"
      onClick={() => canSync && useStore.getState().triggerSync(true)}
      disabled={!canSync}
      title={title}
      aria-label={`Sync status: ${config.label}`}
      className={`flex items-center gap-1.5 px-2 py-1 border border-cyan-dim/20 bg-panel/60 font-body text-[10px] uppercase tracking-wider cursor-pointer disabled:cursor-default shrink-0 ${config.textClass}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dotClass} ${config.pulse ? 'animate-glow-pulse' : ''}`}
        style={config.glow ? { boxShadow: config.glow } : undefined}
        aria-hidden="true"
      />
      <span>{config.label}</span>
    </button>
  );
}
