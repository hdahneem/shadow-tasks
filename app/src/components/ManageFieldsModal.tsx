import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { fieldsApi } from '../api/services';
import { FIELD_TYPES, FIELD_TYPE_LABELS, type CustomFieldDefinition, type FieldType } from '../types';

const OPTIONS_TYPES: FieldType[] = ['dropdown', 'multi_select'];

export function ManageFieldsModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<FieldType>('text');
  const [options, setOptions] = useState<string[]>(['']);
  const [error, setError] = useState<string | null>(null);

  const refetch = () => fieldsApi.listForProject(projectId).then(setFields);

  useEffect(() => {
    refetch().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const needsOptions = OPTIONS_TYPES.includes(type);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || creating) return;
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (needsOptions && cleanOptions.length === 0) {
      setError('Add at least one option.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await fieldsApi.create(projectId, {
        name: name.trim(),
        type,
        options: needsOptions ? cleanOptions : undefined,
      });
      setName('');
      setType('text');
      setOptions(['']);
      await refetch();
    } catch {
      setError('Could not create the field. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (field: CustomFieldDefinition) => {
    if (!confirm(`Delete "${field.name}"? This removes its value from every task.`)) return;
    await fieldsApi.remove(field.id);
    refetch();
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const a = fields[index];
    const b = fields[target];
    await Promise.all([
      fieldsApi.update(a.id, { position: b.position }),
      fieldsApi.update(b.id, { position: a.position }),
    ]);
    refetch();
  };

  return (
    <Modal title="Manage Fields" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {loading ? (
          <p className="text-mist-dim text-sm">Loading…</p>
        ) : fields.length === 0 ? (
          <p className="text-mist-dim text-sm">No custom fields yet for this project.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {fields.map((f, i) => (
              <div key={f.id} className="flex items-center gap-2 border border-cyan-dim/20 px-3 py-2">
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="text-mist-dim hover:text-cyan-bright disabled:opacity-20 text-[10px] leading-none cursor-pointer"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === fields.length - 1}
                    className="text-mist-dim hover:text-cyan-bright disabled:opacity-20 text-[10px] leading-none cursor-pointer"
                  >
                    ▼
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{f.name}</div>
                  <div className="text-[11px] text-mist-dim">
                    {FIELD_TYPE_LABELS[f.type]}
                    {f.options && f.options.length > 0 ? ` · ${f.options.join(', ')}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => remove(f)}
                  className="text-mist-dim hover:text-danger text-xs cursor-pointer shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-3 pt-3 border-t border-cyan-dim/20">
          <div>
            <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
              New Field Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Budget"
              className="hud-input w-full px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as FieldType)}
              className="hud-input w-full px-3 py-2 text-sm"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FIELD_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          {needsOptions && (
            <div>
              <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
                Options
              </label>
              <div className="flex flex-col gap-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={opt}
                      onChange={(e) =>
                        setOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))
                      }
                      placeholder={`Option ${i + 1}`}
                      className="hud-input flex-1 px-3 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
                      disabled={options.length === 1}
                      className="text-mist-dim hover:text-danger text-xs px-1 cursor-pointer disabled:opacity-30"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setOptions((prev) => [...prev, ''])}
                  className="text-xs text-cyan-dim hover:text-cyan-bright cursor-pointer self-start"
                >
                  + Add option
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-danger text-sm">{error}</p>}
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="hud-btn hud-btn-solid py-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Adding…' : '+ Add Field'}
          </button>
        </form>
      </div>
    </Modal>
  );
}
