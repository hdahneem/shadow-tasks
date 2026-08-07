import { useEffect, useMemo, useState } from 'react';
import { timeEntriesApi, tasksApi } from '../api/services';
import { ApiError } from '../api/client';
import { useAuthStore } from '../store/useAuthStore';
import type { Task, TimeEntry } from '../types';

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function computeLiveMinutes(entries: TimeEntry[], nowMs: number): number {
  const totalMs = entries.reduce((sum, e) => {
    const end = e.endedAt ? new Date(e.endedAt).getTime() : nowMs;
    return sum + Math.max(0, end - new Date(e.startedAt).getTime());
  }, 0);
  return Math.round(totalMs / 60000);
}

export function TimeTrackingPanel({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const entries = useMemo(() => task.timeEntries ?? [], [task.timeEntries]);
  const runningEntry = entries.find((e) => !e.endedAt && e.userId === currentUserId);
  const anyRunning = entries.some((e) => !e.endedAt);

  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState(String(task.estimatedMinutes ?? ''));
  const [logging, setLogging] = useState(false);
  const [logStart, setLogStart] = useState('');
  const [logEnd, setLogEnd] = useState('');
  const [logNote, setLogNote] = useState('');
  const [logError, setLogError] = useState<string | null>(null);

  useEffect(() => {
    setEstimate(String(task.estimatedMinutes ?? ''));
  }, [task.estimatedMinutes]);

  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyRunning]);

  const liveMinutes = computeLiveMinutes(entries, now);

  const toggleTimer = async () => {
    setError(null);
    setBusy(true);
    try {
      if (runningEntry) {
        await timeEntriesApi.stop(task.id);
      } else {
        await timeEntriesApi.start(task.id);
      }
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the timer.');
    } finally {
      setBusy(false);
    }
  };

  const saveEstimate = async () => {
    const parsed = estimate.trim() === '' ? null : Number(estimate);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return;
    if (parsed === (task.estimatedMinutes ?? null)) return;
    await tasksApi.update(task.id, { estimatedMinutes: parsed });
    onChanged();
  };

  const submitManualEntry = async () => {
    if (!logStart || !logEnd) return;
    setLogError(null);
    try {
      await timeEntriesApi.logManual(task.id, {
        startedAt: new Date(logStart).toISOString(),
        endedAt: new Date(logEnd).toISOString(),
        note: logNote.trim() || undefined,
      });
      setLogging(false);
      setLogStart('');
      setLogEnd('');
      setLogNote('');
      onChanged();
    } catch (err) {
      setLogError(err instanceof ApiError ? err.message : 'Could not log that time.');
    }
  };

  const removeEntry = async (entryId: string) => {
    await timeEntriesApi.remove(entryId);
    onChanged();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-6 text-sm">
        <div>
          <span className="block text-[10px] uppercase tracking-widest text-mist-dim">Estimated</span>
          <div className="flex items-baseline gap-1">
            <input
              type="number"
              min={0}
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              onBlur={saveEstimate}
              placeholder="—"
              aria-label="Estimated minutes"
              className="hud-input w-20 px-2 py-1 text-xs"
            />
            <span className="text-mist-dim text-xs">min</span>
          </div>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-widest text-mist-dim">Logged</span>
          <span className="font-mono text-cyan-bright">{formatMinutes(liveMinutes)}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={toggleTimer}
          disabled={busy}
          className="hud-btn text-xs px-3 py-1.5 cursor-pointer disabled:opacity-50"
        >
          {runningEntry ? 'Stop Timer' : 'Start Timer'}
        </button>
        {!logging && (
          <button onClick={() => setLogging(true)} className="text-xs text-mist-dim hover:text-cyan-bright cursor-pointer px-2">
            + Log Time
          </button>
        )}
      </div>
      {error && <p className="text-danger text-sm">{error}</p>}

      {logging && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <label className="flex flex-col gap-1 text-xs text-mist-dim flex-1">
              Start
              <input
                type="datetime-local"
                value={logStart}
                onChange={(e) => setLogStart(e.target.value)}
                className="hud-input px-2 py-1.5 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-mist-dim flex-1">
              End
              <input
                type="datetime-local"
                value={logEnd}
                onChange={(e) => setLogEnd(e.target.value)}
                className="hud-input px-2 py-1.5 text-xs"
              />
            </label>
          </div>
          <input
            value={logNote}
            onChange={(e) => setLogNote(e.target.value)}
            placeholder="Note (optional)"
            className="hud-input px-2 py-1.5 text-xs"
          />
          {logError && <p className="text-danger text-sm">{logError}</p>}
          <div className="flex gap-2">
            <button
              onClick={submitManualEntry}
              disabled={!logStart || !logEnd}
              className="hud-btn text-xs px-3 py-1.5 cursor-pointer disabled:opacity-50"
            >
              Log Time
            </button>
            <button
              onClick={() => {
                setLogging(false);
                setLogError(null);
              }}
              className="text-xs text-mist-dim hover:text-danger cursor-pointer px-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <div className="flex flex-col divide-y divide-cyan-dim/10">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 text-sm py-1.5">
              <div className="min-w-0">
                <span className="text-mist">
                  {e.endedAt
                    ? formatMinutes(Math.round((new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime()) / 60000))
                    : 'In progress…'}
                </span>
                <span className="text-mist-dim text-xs ml-2">{e.userName}</span>
                {e.note && <span className="block text-mist-dim text-xs truncate">{e.note}</span>}
              </div>
              <button
                onClick={() => removeEntry(e.id)}
                className="text-mist-dim hover:text-danger text-xs cursor-pointer shrink-0"
                aria-label="Delete time entry"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
