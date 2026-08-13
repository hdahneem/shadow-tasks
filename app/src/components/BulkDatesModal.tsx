import { useState } from 'react';
import { Modal } from './Modal';

/**
 * Bulk start/due date editor. Only fields the user actually touches are
 * included in the patch — touching a field then clearing it sends `null`
 * (explicit clear), leaving it untouched sends nothing (no change).
 */
export function BulkDatesModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (patch: { startDate?: string | null; dueDate?: string | null }) => Promise<void> | void;
  onClose: () => void;
}) {
  const [startDate, setStartDate] = useState('');
  const [startTouched, setStartTouched] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [dueTouched, setDueTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = (startTouched || dueTouched) && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    const patch: { startDate?: string | null; dueDate?: string | null } = {};
    if (startTouched) patch.startDate = startDate ? new Date(startDate).toISOString() : null;
    if (dueTouched) patch.dueDate = dueDate ? new Date(dueDate).toISOString() : null;
    setSubmitting(true);
    try {
      await onSubmit(patch);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Change Dates" onClose={onClose}>
      <div className="flex flex-col gap-4 mb-4">
        <div>
          <span className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">Start Date</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setStartTouched(true);
            }}
            className="hud-input w-full px-3 py-2 text-sm"
          />
          {startTouched && !startDate && <p className="text-[11px] text-mist-dim mt-1">Will clear the start date.</p>}
        </div>
        <div>
          <span className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">Due Date</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              setDueTouched(true);
            }}
            className="hud-input w-full px-3 py-2 text-sm"
          />
          {dueTouched && !dueDate && <p className="text-[11px] text-mist-dim mt-1">Will clear the due date.</p>}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="hud-btn text-xs px-3 py-1.5 cursor-pointer disabled:opacity-50"
        >
          {submitting ? '…' : 'Apply'}
        </button>
        <button onClick={onClose} className="text-xs text-mist-dim hover:text-danger cursor-pointer px-2">
          Cancel
        </button>
      </div>
    </Modal>
  );
}
