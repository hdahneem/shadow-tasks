import { useEffect, useState } from 'react';
import { tagsApi, taskTagsApi } from '../api/services';
import { ApiError } from '../api/client';
import type { Tag, Task } from '../types';

const COLORS = ['#7c93b3', '#22d3ee', '#a855f7', '#4ade80', '#facc15', '#f43f5e', '#fb923c'];
const CREATE_NEW = '__create_new__';

export function TagsPanel({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const [workspaceTags, setWorkspaceTags] = useState<Tag[]>([]);
  const [adding, setAdding] = useState(false);
  const [selection, setSelection] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const tags = task.tags ?? [];

  useEffect(() => {
    if (task.workspaceId) tagsApi.list(task.workspaceId).then(setWorkspaceTags);
  }, [task.workspaceId]);

  const tagIds = new Set(tags.map((t) => t.id));
  const available = workspaceTags.filter((t) => !tagIds.has(t.id));
  const creatingNew = selection === CREATE_NEW || available.length === 0;

  const submit = async () => {
    if (submitting) return;
    setError(null);

    if (selection === CREATE_NEW || available.length === 0) {
      if (!newName.trim() || !task.workspaceId) return;
      setSubmitting(true);
      try {
        const tag = await tagsApi.create(task.workspaceId, newName.trim(), newColor);
        await taskTagsApi.add(task.id, tag.id);
        setAdding(false);
        setSelection('');
        setNewName('');
        setNewColor(COLORS[0]);
        onChanged();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not create that tag.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!selection) return;
    setSubmitting(true);
    try {
      await taskTagsApi.add(task.id, selection);
      setAdding(false);
      setSelection('');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add that tag.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (tagId: string) => {
    await taskTagsApi.remove(task.id, tagId);
    onChanged();
  };

  return (
    <div className="flex flex-col gap-3">
      {tags.length === 0 ? (
        <p className="text-mist-dim text-sm">No tags yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-sm border"
              style={{ borderColor: t.color, color: t.color }}
            >
              {t.name}
              <button
                onClick={() => remove(t.id)}
                className="hover:text-danger cursor-pointer"
                aria-label={`Remove ${t.name} tag`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {adding ? (
        <div className="flex flex-col gap-2">
          {available.length > 0 && (
            <select
              autoFocus
              value={selection}
              onChange={(e) => setSelection(e.target.value)}
              className="hud-input px-2 py-1.5 text-xs"
            >
              <option value="">Select a tag…</option>
              {available.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value={CREATE_NEW}>+ New tag…</option>
            </select>
          )}
          {creatingNew && (
            <div className="flex flex-col gap-2">
              <input
                autoFocus={available.length === 0}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tag name"
                className="hud-input px-2 py-1.5 text-xs"
              />
              <div className="flex gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    aria-label={c}
                    className="w-5 h-5 rounded-full cursor-pointer border-2"
                    style={{
                      background: c,
                      borderColor: newColor === c ? '#fff' : 'transparent',
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-danger text-sm">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={submitting || (creatingNew ? !newName.trim() : !selection)}
              className="hud-btn text-xs px-3 py-1.5 cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Adding…' : creatingNew ? 'Create & Add' : 'Add Tag'}
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setSelection('');
                setError(null);
              }}
              className="text-xs text-mist-dim hover:text-danger cursor-pointer px-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="hud-btn text-xs px-3 py-1.5 cursor-pointer self-start">
          + Add Tag
        </button>
      )}
    </div>
  );
}
