import { useEffect, useState } from 'react';
import { assigneesApi, workspacesApi } from '../api/services';
import { ApiError } from '../api/client';
import type { Task, WorkspaceMember } from '../types';

export function AssigneesPanel({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [adding, setAdding] = useState(false);
  const [userId, setUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const assignees = task.assignees ?? [];

  useEffect(() => {
    if (task.workspaceId) workspacesApi.members(task.workspaceId).then(setMembers);
  }, [task.workspaceId]);

  const assignedIds = new Set(assignees.map((a) => a.id));
  const candidates = members.filter((m) => !assignedIds.has(m.user.id));

  const submit = async () => {
    if (!userId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await assigneesApi.add(task.id, userId);
      setAdding(false);
      setUserId('');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not assign that hunter.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (removeUserId: string) => {
    await assigneesApi.remove(task.id, removeUserId);
    onChanged();
  };

  return (
    <div className="flex flex-col gap-3">
      {assignees.length === 0 ? (
        <p className="text-mist-dim text-sm">Unassigned.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {assignees.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="shrink-0 w-5 h-5 rounded-full bg-cyan-dim/20 text-cyan-bright text-[10px] font-mono flex items-center justify-center uppercase"
                  aria-hidden
                >
                  {a.name.slice(0, 2)}
                </span>
                <span className="text-mist truncate">{a.name}</span>
              </span>
              <button
                onClick={() => remove(a.id)}
                className="text-mist-dim hover:text-danger text-xs cursor-pointer shrink-0"
                aria-label={`Unassign ${a.name}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="flex flex-col gap-2">
          <select
            autoFocus
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="hud-input px-2 py-1.5 text-xs"
          >
            <option value="">Select a hunter…</option>
            {candidates.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.name}
              </option>
            ))}
          </select>
          {error && <p className="text-danger text-sm">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={!userId || submitting}
              className="hud-btn text-xs px-3 py-1.5 cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Assigning…' : 'Assign'}
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="text-xs text-mist-dim hover:text-danger cursor-pointer px-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="hud-btn text-xs px-3 py-1.5 cursor-pointer self-start">
          + Assign
        </button>
      )}
    </div>
  );
}
