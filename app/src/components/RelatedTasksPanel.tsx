import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { relationsApi } from '../api/services';
import { ApiError } from '../api/client';
import { RELATION_TYPES, RELATION_TYPE_LABELS, type RelationType, type Task } from '../types';

export function RelatedTasksPanel({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const allTasks = useStore((s) => s.tasks);
  const [adding, setAdding] = useState(false);
  const [relatedTaskId, setRelatedTaskId] = useState('');
  const [type, setType] = useState<RelationType>('related');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const relatedTasks = task.relatedTasks ?? [];
  const excludedIds = new Set([task.id, ...relatedTasks.map((r) => r.task.id)]);
  const candidates = allTasks.filter((t) => t.list?.project?.id === task.projectId && !excludedIds.has(t.id));

  const submit = async () => {
    if (!relatedTaskId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await relationsApi.create(task.id, relatedTaskId, type);
      setAdding(false);
      setRelatedTaskId('');
      setType('related');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not link that quest.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (relationId: string) => {
    await relationsApi.remove(relationId);
    onChanged();
  };

  return (
    <div className="flex flex-col gap-4">
      {relatedTasks.length === 0 ? (
        <p className="text-mist-dim text-sm">No related quests yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-cyan-dim/10">
          {relatedTasks.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-sm py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: r.task.done ? '#4ade80' : '#7c93b3' }}
                />
                <Link
                  to={`/tasks/${r.task.id}`}
                  className={`truncate hover:underline ${r.task.done ? 'task-strike text-mist-dim' : 'text-mist'}`}
                >
                  {r.task.title}
                </Link>
                <span className="text-[10px] text-mist-dim font-mono shrink-0">
                  {RELATION_TYPE_LABELS[r.type]}
                </span>
              </div>
              <button
                onClick={() => remove(r.id)}
                className="text-mist-dim hover:text-danger text-xs cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <select
              autoFocus
              value={relatedTaskId}
              onChange={(e) => setRelatedTaskId(e.target.value)}
              className="hud-input flex-1 min-w-0 px-2 py-1.5 text-xs"
            >
              <option value="">Select a quest…</option>
              {candidates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as RelationType)}
              className="hud-input px-2 py-1.5 text-xs"
            >
              {RELATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {RELATION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-danger text-sm">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={!relatedTaskId || submitting}
              className="hud-btn text-xs px-3 py-1.5 cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Linking…' : 'Link Quest'}
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
          + Link Quest
        </button>
      )}
    </div>
  );
}
