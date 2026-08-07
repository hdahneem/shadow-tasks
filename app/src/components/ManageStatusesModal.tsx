import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { statusesApi } from '../api/services';
import { ApiError } from '../api/client';
import type { Status } from '../types';

const COLORS = ['#7c93b3', '#22d3ee', '#a855f7', '#4ade80', '#facc15', '#f43f5e', '#fb923c'];

export function ManageStatusesModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const refetch = () => statusesApi.listForProject(projectId).then(setStatuses);

  useEffect(() => {
    refetch().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      await statusesApi.create(projectId, { name: name.trim(), color, isCompleted });
      setName('');
      setColor(COLORS[0]);
      setIsCompleted(false);
      await refetch();
    } catch {
      setError('Could not create the status. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (status: Status) => {
    if (!confirm(`Delete "${status.name}"?`)) return;
    setRowError(null);
    try {
      await statusesApi.remove(status.id);
      refetch();
    } catch (err) {
      setRowError(
        err instanceof ApiError ? err.message : 'Could not delete this status. Please try again.'
      );
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= statuses.length) return;
    const a = statuses[index];
    const b = statuses[target];
    await Promise.all([
      statusesApi.update(a.id, { position: b.position }),
      statusesApi.update(b.id, { position: a.position }),
    ]);
    refetch();
  };

  const toggleCompleted = async (status: Status) => {
    await statusesApi.update(status.id, { isCompleted: !status.isCompleted });
    refetch();
  };

  return (
    <Modal title="Manage Statuses" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {rowError && <p className="text-danger text-sm">{rowError}</p>}
        {loading ? (
          <p className="text-mist-dim text-sm">Loading…</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {statuses.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 border border-cyan-dim/20 px-3 py-2">
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="text-mist-dim hover:text-cyan-bright disabled:opacity-20 text-[10px] leading-none cursor-pointer"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === statuses.length - 1}
                    className="text-mist-dim hover:text-cyan-bright disabled:opacity-20 text-[10px] leading-none cursor-pointer"
                  >
                    ▼
                  </button>
                </div>
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }}
                />
                <div className="flex-1 min-w-0 text-sm truncate">{s.name}</div>
                <label className="flex items-center gap-1.5 text-[11px] text-mist-dim shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={s.isCompleted}
                    onChange={() => toggleCompleted(s)}
                  />
                  Counts as done
                </label>
                <button
                  onClick={() => remove(s)}
                  className="text-mist-dim hover:text-danger text-xs cursor-pointer shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-3 pt-3 border-t border-cyan-dim/20">
          <div>
            <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
              New Status Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. In Review"
              className="hud-input w-full px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
              Color
            </label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-6 h-6 rounded-full cursor-pointer transition-transform"
                  style={{
                    background: c,
                    boxShadow: color === c ? `0 0 0 2px #04070d, 0 0 0 4px ${c}` : 'none',
                    transform: color === c ? 'scale(1.1)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-mist cursor-pointer">
            <input
              type="checkbox"
              checked={isCompleted}
              onChange={(e) => setIsCompleted(e.target.checked)}
            />
            Tasks here count as done
          </label>

          {error && <p className="text-danger text-sm">{error}</p>}
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="hud-btn hud-btn-solid py-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Adding…' : '+ Add Status'}
          </button>
        </form>
      </div>
    </Modal>
  );
}
