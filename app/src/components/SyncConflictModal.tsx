import { Modal } from './Modal';

function formatWhen(iso: string | number | null): string {
  if (iso === null) return 'a while ago';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function SyncConflictModal({
  localChangedAt,
  serverChangedAt,
  busy,
  onKeepPhone,
  onKeepDesktop,
  onClose,
}: {
  localChangedAt: number;
  serverChangedAt: string | null;
  busy: boolean;
  onKeepPhone: () => void;
  onKeepDesktop: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Sync Conflict" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-mist">
          You made changes on this phone while it was offline, and your desktop's data has changed too since the
          last time these synced. Pick which one to keep — the other side's differing changes won't be applied.
        </p>
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-mist-dim">This phone last changed</span>
            <span className="font-mono text-cyan-bright">{formatWhen(localChangedAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-mist-dim">Desktop last changed</span>
            <span className="font-mono text-cyan-bright">{formatWhen(serverChangedAt)}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={onKeepPhone}
            disabled={busy}
            className="hud-btn hud-btn-solid py-2.5 cursor-pointer disabled:opacity-50"
          >
            {busy ? 'Syncing…' : "Keep this phone's changes"}
          </button>
          <button
            onClick={onKeepDesktop}
            disabled={busy}
            className="hud-btn py-2.5 cursor-pointer disabled:opacity-50"
          >
            {busy ? 'Syncing…' : "Keep desktop's version"}
          </button>
        </div>
        <p className="text-mist-dim text-xs">
          "Keep this phone's changes" replays only what you did offline on top of the desktop's current data —
          nothing the desktop changed on its own gets deleted or overwritten.
        </p>
      </div>
    </Modal>
  );
}
