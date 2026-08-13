import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { workspacesApi } from '../api/services';
import type { WorkspaceMember } from '../types';

export function BulkAssignModal({
  workspaceId,
  onSubmit,
  onClose,
}: {
  workspaceId: string;
  onSubmit: (userId: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [userId, setUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    workspacesApi.members(workspaceId).then(setMembers);
  }, [workspaceId]);

  const submit = async () => {
    if (!userId || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(userId);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Assign a Hunter" onClose={onClose}>
      <select
        autoFocus
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        className="hud-input w-full mb-4 px-3 py-2 text-sm"
      >
        <option value="">Select a hunter…</option>
        {members.map((m) => (
          <option key={m.user.id} value={m.user.id}>
            {m.user.name}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={!userId || submitting}
          className="hud-btn text-xs px-3 py-1.5 cursor-pointer disabled:opacity-50"
        >
          {submitting ? 'Assigning…' : 'Assign'}
        </button>
        <button onClick={onClose} className="text-xs text-mist-dim hover:text-danger cursor-pointer px-2">
          Cancel
        </button>
      </div>
    </Modal>
  );
}
