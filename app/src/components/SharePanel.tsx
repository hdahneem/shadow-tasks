import { useState } from 'react';
import { shareApi } from '../api/services';
import type { Task } from '../types';

export function SharePanel({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = task.shareToken ? `${window.location.origin}/share/${task.shareToken}` : null;

  const enable = async () => {
    setBusy(true);
    try {
      await shareApi.enable(task.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!confirm('Revoke this public link? Anyone with the old link will lose access.')) return;
    setBusy(true);
    try {
      await shareApi.revoke(task.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!shareUrl) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-mist-dim text-sm">Not shared publicly.</p>
        <button
          onClick={enable}
          disabled={busy}
          className="hud-btn text-xs px-3 py-1.5 cursor-pointer self-start disabled:opacity-50"
        >
          + Enable Public Link
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-mist-dim text-xs">Anyone with this link can view a read-only copy of this quest.</p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={shareUrl}
          onFocus={(e) => e.target.select()}
          aria-label="Public share link"
          className="hud-input flex-1 min-w-0 px-2 py-1.5 text-xs font-mono"
        />
        <button onClick={copyLink} className="hud-btn text-xs px-3 py-1.5 cursor-pointer shrink-0">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <button
        onClick={revoke}
        disabled={busy}
        className="text-xs text-mist-dim hover:text-danger cursor-pointer self-start disabled:opacity-50"
      >
        Revoke link
      </button>
    </div>
  );
}
