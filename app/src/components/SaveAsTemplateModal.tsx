import { useState } from 'react';
import { Modal } from './Modal';

export function SaveAsTemplateModal({
  title,
  placeholder,
  onSave,
  onClose,
}: {
  title: string;
  placeholder: string;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSave(name.trim());
      onClose();
    } catch {
      setError('Could not save the template. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          className="hud-input w-full px-3 py-2 text-sm"
        />
        {error && <p className="text-danger text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="hud-btn hud-btn-solid py-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Saving…' : 'Save Template'}
        </button>
      </form>
    </Modal>
  );
}
