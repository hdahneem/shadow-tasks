import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/useStore';
import { taskTemplatesApi } from '../api/services';
import type { TaskTemplate } from '../types';

export function CreateTaskFromTemplateModal({
  listId,
  onClose,
}: {
  listId: string;
  onClose: () => void;
}) {
  const createTaskFromTemplate = useStore((s) => s.createTaskFromTemplate);
  const [templates, setTemplates] = useState<TaskTemplate[] | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    taskTemplatesApi.list().then((list) => {
      setTemplates(list);
      if (list.length > 0) setTemplateId(list[0].id);
    });
  }, []);

  const submit = async () => {
    if (!templateId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await createTaskFromTemplate(templateId, listId);
      onClose();
    } catch {
      setError('Could not create the quest. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Modal title="New Quest From Template" onClose={onClose}>
      {templates === null ? (
        <p className="text-mist-dim text-sm">Loading templates…</p>
      ) : templates.length === 0 ? (
        <p className="text-mist-dim text-sm">
          No saved templates yet. Open a quest and choose "Save as Template" to create one.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
              Template
            </label>
            <select
              autoFocus
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="hud-input w-full px-3 py-2 text-sm"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-danger text-sm">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="hud-btn hud-btn-solid py-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating…' : 'Create Quest'}
          </button>
        </form>
      )}
    </Modal>
  );
}
