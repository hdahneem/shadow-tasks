import { useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/useStore';
import type { Priority } from '../types';

const PRIORITIES: Priority[] = ['low', 'medium', 'high'];

export function TaskModal({ listId, onClose }: { listId: string; onClose: () => void }) {
  const addTask = useStore((s) => s.addTask);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await addTask(listId, title.trim(), priority, dueDate || undefined, description.trim() || undefined);
      onClose();
    } catch {
      setError('Could not create the task. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Modal title="New Quest" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
            Task
          </label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Slay the ice elves"
            className="hud-input w-full px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="hud-input w-full px-3 py-2 text-sm resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="hud-input w-full px-3 py-2 text-sm capitalize"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="hud-input w-full px-3 py-2 text-sm"
            />
          </div>
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="hud-btn hud-btn-solid py-2.5 mt-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Adding…' : 'Add Quest'}
        </button>
      </form>
    </Modal>
  );
}
