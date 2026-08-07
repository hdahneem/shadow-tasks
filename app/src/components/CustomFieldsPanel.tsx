import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fieldsApi } from '../api/services';
import type { TaskCustomField, FieldValue } from '../types';

export function CustomFieldsPanel({
  taskId,
  projectId,
  fields,
  onChanged,
}: {
  taskId: string;
  projectId: string;
  fields: TaskCustomField[];
  onChanged: () => void;
}) {
  if (fields.length === 0) {
    return (
      <p className="text-mist-dim text-sm">
        This project has no custom fields yet.{' '}
        <Link to={`/projects/${projectId}`} className="text-cyan-bright hover:underline">
          Add some
        </Link>{' '}
        from the project page.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {fields.map((field) => (
        <FieldInput key={field.id} taskId={taskId} field={field} onChanged={onChanged} />
      ))}
    </div>
  );
}

function FieldInput({
  taskId,
  field,
  onChanged,
}: {
  taskId: string;
  field: TaskCustomField;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const save = async (value: FieldValue) => {
    setSaving(true);
    try {
      await fieldsApi.setValue(taskId, field.id, value);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={saving ? 'opacity-60 transition-opacity' : ''}>
      <span className="block font-body text-[11px] tracking-widest uppercase text-mist mb-1">
        {field.name}
      </span>
      <FieldControl field={field} onSave={save} />
    </div>
  );
}

export function FieldControl({ field, onSave }: { field: TaskCustomField; onSave: (v: FieldValue) => void }) {
  switch (field.type) {
    case 'text':
      return <TextInput initial={(field.value as string) ?? ''} onSave={onSave} />;
    case 'email':
      return <TextInput type="email" initial={(field.value as string) ?? ''} onSave={onSave} />;
    case 'phone':
      return <TextInput type="tel" initial={(field.value as string) ?? ''} onSave={onSave} />;
    case 'url':
      return <TextInput type="url" initial={(field.value as string) ?? ''} onSave={onSave} />;
    case 'number':
      return <NumberInput initial={field.value as number | null} onSave={onSave} />;
    case 'currency':
      return <NumberInput prefix="$" initial={field.value as number | null} onSave={onSave} />;
    case 'checkbox':
      return (
        <button
          onClick={() => onSave(!(field.value as boolean))}
          className="w-6 h-6 border cursor-pointer flex items-center justify-center"
          style={{
            borderColor: field.value ? '#4ade80' : 'rgba(34,211,238,0.5)',
            background: field.value ? 'rgba(74,222,128,0.15)' : 'transparent',
          }}
          aria-pressed={!!field.value}
        >
          {field.value ? <span style={{ color: '#4ade80' }}>✓</span> : null}
        </button>
      );
    case 'rating':
      return <RatingInput value={(field.value as number) ?? 0} onSave={onSave} />;
    case 'dropdown':
      return (
        <select
          value={(field.value as string) ?? ''}
          onChange={(e) => onSave(e.target.value || null)}
          className="hud-input w-full px-2 py-1.5 text-sm"
        >
          <option value="">—</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
          {field.value && !field.options?.includes(field.value as string) && (
            <option value={field.value as string}>{field.value as string} (removed option)</option>
          )}
        </select>
      );
    case 'multi_select': {
      const selected = new Set((field.value as string[]) ?? []);
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((opt) => {
            const active = selected.has(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  const next = new Set(selected);
                  if (active) next.delete(opt);
                  else next.add(opt);
                  onSave(Array.from(next));
                }}
                className="text-xs px-2.5 py-1 border cursor-pointer transition-colors"
                style={{
                  borderColor: active ? '#22d3ee' : 'rgba(34,211,238,0.3)',
                  background: active ? 'rgba(34,211,238,0.15)' : 'transparent',
                  color: active ? 'var(--color-cyan-bright)' : 'var(--color-mist)',
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );
    }
    case 'date':
      return (
        <input
          type="date"
          value={field.value ? String(field.value).slice(0, 10) : ''}
          onChange={(e) => onSave(e.target.value ? new Date(e.target.value).toISOString() : null)}
          className="hud-input w-full px-2 py-1.5 text-sm"
        />
      );
    default:
      return null;
  }
}

function TextInput({
  initial,
  onSave,
  type = 'text',
}: {
  initial: string;
  onSave: (v: FieldValue) => void;
  type?: 'text' | 'email' | 'tel' | 'url';
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== initial) onSave(value.trim() || null);
      }}
      className="hud-input w-full px-2 py-1.5 text-sm"
    />
  );
}

function NumberInput({
  initial,
  onSave,
  prefix,
}: {
  initial: number | null;
  onSave: (v: FieldValue) => void;
  prefix?: string;
}) {
  const [value, setValue] = useState(initial === null ? '' : String(initial));
  return (
    <div className="relative">
      {prefix && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-mist text-sm">{prefix}</span>
      )}
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          const num = value.trim() === '' ? null : Number(value);
          if (num !== initial && (num === null || Number.isFinite(num))) onSave(num);
        }}
        className={`hud-input w-full py-1.5 text-sm ${prefix ? 'pl-6 pr-2' : 'px-2'}`}
      />
    </div>
  );
}

function RatingInput({ value, onSave }: { value: number; onSave: (v: FieldValue) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onSave(n === value ? null : n)}
          className="text-lg leading-none cursor-pointer"
          style={{ color: n <= value ? 'var(--color-violet-bright)' : 'var(--color-mist-dim)' }}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
