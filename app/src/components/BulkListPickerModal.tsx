import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/useStore';

/**
 * Shared list picker for "Move to List" and "Add to List" — grouped by
 * project, same layout as AddToTodayModal's list filter dropdown.
 */
export function BulkListPickerModal({
  title,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  submitLabel: string;
  onSubmit: (listId: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const lists = useStore((s) => s.lists);
  const projects = useStore((s) => s.projects);
  const [listId, setListId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const listGroups = useMemo(() => {
    const projectNames = new Map(projects.map((p) => [p.id, p.name]));
    const groups = new Map<string, { projectName: string; lists: typeof lists }>();
    for (const list of lists) {
      const projectName = projectNames.get(list.projectId) ?? 'Other';
      if (!groups.has(list.projectId)) groups.set(list.projectId, { projectName, lists: [] });
      groups.get(list.projectId)!.lists.push(list);
    }
    return [...groups.entries()]
      .map(([projectId, group]) => ({ projectId, ...group }))
      .sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [lists, projects]);

  const submit = async () => {
    if (!listId || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(listId);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <select
        autoFocus
        value={listId}
        onChange={(e) => setListId(e.target.value)}
        className="hud-input w-full mb-4 px-3 py-2 text-sm"
      >
        <option value="">Select a list…</option>
        {listGroups.map((group) => (
          <optgroup key={group.projectId} label={group.projectName}>
            {group.lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={!listId || submitting}
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
