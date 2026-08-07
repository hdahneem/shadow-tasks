import { useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/useStore';

const COLORS = ['#22d3ee', '#a855f7', '#4ade80', '#facc15', '#f43f5e', '#fb923c'];

export function CreateFolderModal({ onClose }: { onClose: () => void }) {
  const addFolder = useStore((s) => s.addFolder);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await addFolder(name.trim(), color);
      onClose();
    } catch {
      setError('Could not create the folder. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Modal title="New Folder" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
            Folder Name
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dungeon Raids"
            className="hud-input w-full px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
            Marker Color
          </label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full cursor-pointer transition-transform"
                style={{
                  background: c,
                  boxShadow: color === c ? `0 0 0 2px #04070d, 0 0 0 4px ${c}` : 'none',
                  transform: color === c ? 'scale(1.1)' : 'scale(1)',
                }}
              />
            ))}
          </div>
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="hud-btn hud-btn-solid py-2.5 mt-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Creating…' : 'Create Folder'}
        </button>
      </form>
    </Modal>
  );
}
