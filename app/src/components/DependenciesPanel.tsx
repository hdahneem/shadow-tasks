import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { dependenciesApi } from '../api/services';
import { ApiError } from '../api/client';
import { DEPENDENCY_TYPES, DEPENDENCY_TYPE_LABELS, type DependencyType, type Task, type TaskDependency } from '../types';

function DependencyRow({
  dependency,
  onRemove,
}: {
  dependency: TaskDependency;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: dependency.task.done ? '#4ade80' : '#f43f5e' }}
        />
        <Link
          to={`/tasks/${dependency.task.id}`}
          className={`truncate hover:underline ${dependency.task.done ? 'task-strike text-mist-dim' : 'text-mist'}`}
        >
          {dependency.task.title}
        </Link>
        <span className="text-[10px] text-mist-dim font-mono shrink-0">
          {DEPENDENCY_TYPE_LABELS[dependency.type]}
        </span>
      </div>
      <button
        onClick={() => onRemove(dependency.id)}
        className="text-mist-dim hover:text-danger text-xs cursor-pointer shrink-0"
      >
        ✕
      </button>
    </div>
  );
}

export function DependenciesPanel({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const allTasks = useStore((s) => s.tasks);
  const [adding, setAdding] = useState(false);
  const [predecessorId, setPredecessorId] = useState('');
  const [type, setType] = useState<DependencyType>('finish_to_start');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dependsOn = task.dependsOn ?? [];
  const blocks = task.blocks ?? [];
  const excludedIds = new Set([task.id, ...dependsOn.map((d) => d.task.id)]);
  const candidates = allTasks.filter((t) => t.list?.project?.id === task.projectId && !excludedIds.has(t.id));

  const submit = async () => {
    if (!predecessorId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await dependenciesApi.create(task.id, predecessorId, type);
      setAdding(false);
      setPredecessorId('');
      setType('finish_to_start');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add that dependency.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (dependencyId: string) => {
    await dependenciesApi.remove(dependencyId);
    onChanged();
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-display text-xs tracking-widest uppercase text-mist mb-1.5">
          Waiting On ({dependsOn.length})
        </h3>
        {dependsOn.length === 0 ? (
          <p className="text-mist-dim text-sm">This quest isn't waiting on anything.</p>
        ) : (
          <div className="flex flex-col divide-y divide-cyan-dim/10">
            {dependsOn.map((d) => (
              <DependencyRow key={d.id} dependency={d} onRemove={remove} />
            ))}
          </div>
        )}
      </div>

      {blocks.length > 0 && (
        <div>
          <h3 className="font-display text-xs tracking-widest uppercase text-mist mb-1.5">
            Blocking ({blocks.length})
          </h3>
          <div className="flex flex-col divide-y divide-cyan-dim/10">
            {blocks.map((d) => (
              <DependencyRow key={d.id} dependency={d} onRemove={remove} />
            ))}
          </div>
        </div>
      )}

      {adding ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <select
              autoFocus
              value={predecessorId}
              onChange={(e) => setPredecessorId(e.target.value)}
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
              onChange={(e) => setType(e.target.value as DependencyType)}
              className="hud-input px-2 py-1.5 text-xs"
            >
              {DEPENDENCY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DEPENDENCY_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-danger text-sm">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={!predecessorId || submitting}
              className="hud-btn text-xs px-3 py-1.5 cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Adding…' : 'Add Dependency'}
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
          + Add Dependency
        </button>
      )}
    </div>
  );
}
