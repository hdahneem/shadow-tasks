import { useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/useStore';

export function CreateWorkspaceModal({ onClose }: { onClose: () => void }) {
  const createWorkspace = useStore((s) => s.createWorkspace);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await createWorkspace(name.trim());
      onClose();
    } catch {
      setError('Could not create the workspace. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Modal title="New Workspace" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
            Workspace Name
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Hunter Association"
            className="hud-input w-full px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="hud-btn hud-btn-solid py-2.5 mt-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Creating…' : 'Create Workspace'}
        </button>
      </form>
    </Modal>
  );
}
