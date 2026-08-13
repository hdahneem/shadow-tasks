import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/useStore';
import { RELATION_TYPES, RELATION_TYPE_LABELS, type RelationType } from '../types';

/**
 * Shared searchable task picker for "Convert to Subtask" (pick the parent)
 * and "Link Tasks" (pick the target + a RelationType, reusing Related
 * Quests). Candidates come straight from the global store so this works
 * regardless of which paginated/local view triggered it.
 */
export function BulkTaskPickerModal({
  title,
  submitLabel,
  excludeIds,
  showRelationType = false,
  onSubmit,
  onClose,
}: {
  title: string;
  submitLabel: string;
  excludeIds: string[];
  showRelationType?: boolean;
  onSubmit: (taskId: string, type?: RelationType) => Promise<void> | void;
  onClose: () => void;
}) {
  const allTasks = useStore((s) => s.tasks);
  const [query, setQuery] = useState('');
  const [taskId, setTaskId] = useState('');
  const [type, setType] = useState<RelationType>('related');
  const [submitting, setSubmitting] = useState(false);

  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allTasks
      .filter((t) => !excludeSet.has(t.id) && !t.archivedAt)
      .filter((t) => !q || t.title.toLowerCase().includes(q))
      .slice(0, 50);
  }, [allTasks, excludeSet, query]);

  const submit = async () => {
    if (!taskId || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(taskId, showRelationType ? type : undefined);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <input
        type="text"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search quests by title…"
        className="hud-input w-full mb-3"
      />
      {showRelationType && (
        <select
          value={type}
          onChange={(e) => setType(e.target.value as RelationType)}
          className="hud-input w-full mb-3 px-2 py-1.5 text-xs"
        >
          {RELATION_TYPES.map((t) => (
            <option key={t} value={t}>
              {RELATION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      )}
      <div className="max-h-64 overflow-y-auto flex flex-col divide-y divide-cyan-dim/10 -mx-6 mb-4">
        {candidates.length === 0 ? (
          <p className="text-sm text-mist-dim py-6 text-center">No matching quests.</p>
        ) : (
          candidates.map((t) => (
            <label
              key={t.id}
              className="flex items-center gap-2 px-6 py-2 cursor-pointer hover:bg-cyan-dim/5"
            >
              <input
                type="radio"
                name="bulk-task-picker"
                checked={taskId === t.id}
                onChange={() => setTaskId(t.id)}
                className="shrink-0"
              />
              <span className="flex-1 min-w-0 text-sm text-mist truncate">{t.title}</span>
              {t.list?.project && (
                <span className="shrink-0 font-mono text-[10px] text-mist-dim truncate">
                  {t.list.project.name} / {t.list.name}
                </span>
              )}
            </label>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={!taskId || submitting}
          className="hud-btn text-xs px-3 py-1.5 cursor-pointer disabled:opacity-50"
        >
          {submitting ? '…' : submitLabel}
        </button>
        <button onClick={onClose} className="text-xs text-mist-dim hover:text-danger cursor-pointer px-2">
          Cancel
        </button>
      </div>
    </Modal>
  );
}
