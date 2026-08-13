import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { statusesApi } from '../api/services';
import type { Status } from '../types';

export function BulkStatusModal({
  projectId,
  onSubmit,
  onClose,
}: {
  projectId: string;
  onSubmit: (statusId: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [statusId, setStatusId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    statusesApi.listForProject(projectId).then(setStatuses);
  }, [projectId]);

  const submit = async () => {
    if (!statusId || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(statusId);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Change Status" onClose={onClose}>
      <select
        autoFocus
        value={statusId}
        onChange={(e) => setStatusId(e.target.value)}
        className="hud-input w-full mb-4 px-3 py-2 text-sm"
      >
        <option value="">Select a status…</option>
        {statuses.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={!statusId || submitting}
          className="hud-btn text-xs px-3 py-1.5 cursor-pointer disabled:opacity-50"
        >
          {submitting ? '…' : 'Set Status'}
        </button>
        <button onClick={onClose} className="text-xs text-mist-dim hover:text-danger cursor-pointer px-2">
          Cancel
        </button>
      </div>
    </Modal>
  );
}
