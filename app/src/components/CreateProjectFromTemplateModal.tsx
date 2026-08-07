import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/useStore';
import { projectTemplatesApi } from '../api/services';
import { RANKS, type Rank, type ProjectTemplate } from '../types';
import { RankBadge } from './RankBadge';

export function CreateProjectFromTemplateModal({
  folderId,
  onClose,
  onCreated,
}: {
  folderId: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const folders = useStore((s) => s.folders);
  const createProjectFromTemplate = useStore((s) => s.createProjectFromTemplate);
  const [templates, setTemplates] = useState<ProjectTemplate[] | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('');
  const [rank, setRank] = useState<Rank>('E');
  const [targetFolder, setTargetFolder] = useState<string | null>(folderId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    projectTemplatesApi.list().then((list) => {
      setTemplates(list);
      if (list.length > 0) setTemplateId(list[0].id);
    });
  }, []);

  const submit = async () => {
    if (!templateId || !name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const id = await createProjectFromTemplate(templateId, name.trim(), targetFolder, rank);
      onCreated(id);
    } catch {
      setError('Could not create the project. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Modal title="New Project From Template" onClose={onClose}>
      {templates === null ? (
        <p className="text-mist-dim text-sm">Loading templates…</p>
      ) : templates.length === 0 ? (
        <p className="text-mist-dim text-sm">
          No saved templates yet. Open a project and choose "Save as Template" to create one.
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
          <div>
            <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
              Project Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Clear the Blue Gate"
              className="hud-input w-full px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block font-body text-xs tracking-widest uppercase text-mist mb-2">
              Difficulty Rank
            </label>
            <div className="flex flex-wrap gap-2">
              {RANKS.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setRank(r)}
                  className="cursor-pointer transition-opacity"
                  style={{ opacity: rank === r ? 1 : 0.4 }}
                >
                  <RankBadge rank={r} size="sm" />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
              Folder
            </label>
            <select
              value={targetFolder ?? ''}
              onChange={(e) => setTargetFolder(e.target.value || null)}
              className="hud-input w-full px-3 py-2 text-sm"
            >
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-danger text-sm">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="hud-btn hud-btn-solid py-2.5 mt-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating…' : 'Create Project'}
          </button>
        </form>
      )}
    </Modal>
  );
}
