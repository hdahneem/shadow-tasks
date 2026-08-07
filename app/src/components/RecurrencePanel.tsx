import { useState } from 'react';
import { recurrenceApi, type RecurrenceCreateInput } from '../api/services';
import { ApiError } from '../api/client';
import {
  RECURRENCE_FREQUENCIES,
  RECURRENCE_FREQUENCY_LABELS,
  RECURRENCE_MODES,
  RECURRENCE_MODE_LABELS,
  type RecurrenceFrequency,
  type RecurrenceMode,
  type Task,
} from '../types';

const UNIT_NOUN: Record<RecurrenceFrequency, string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
};

function cadenceLabel(frequency: RecurrenceFrequency, interval: number): string {
  const unit = UNIT_NOUN[frequency];
  return interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;
}

export function RecurrencePanel({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('daily');
  const [interval, setInterval] = useState('1');
  const [mode, setMode] = useState<RecurrenceMode>('after_completion');
  const [skipWeekends, setSkipWeekends] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [maxOccurrences, setMaxOccurrences] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const rule = task.recurrence;

  const submit = async () => {
    const parsedInterval = Number(interval);
    if (!Number.isInteger(parsedInterval) || parsedInterval < 1) {
      setError('Interval must be a whole number of at least 1.');
      return;
    }
    if (mode === 'fixed_schedule' && !task.dueDate) {
      setError('Set a due date on this quest first — fixed-schedule recurrence needs one to anchor to.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const data: RecurrenceCreateInput = {
        frequency,
        interval: parsedInterval,
        mode,
        skipWeekends,
        endDate: endDate ? new Date(endDate).toISOString() : null,
        maxOccurrences: maxOccurrences ? Number(maxOccurrences) : null,
      };
      await recurrenceApi.create(task.id, data);
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not set up recurrence.');
    } finally {
      setSubmitting(false);
    }
  };

  const stop = async () => {
    if (!rule) return;
    await recurrenceApi.stop(rule.id);
    onChanged();
  };

  if (rule && rule.active) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-mist font-medium">{cadenceLabel(rule.frequency, rule.interval)}</p>
            <p className="text-mist-dim text-xs mt-0.5">
              {RECURRENCE_MODE_LABELS[rule.mode]}
              {rule.skipWeekends && ' · skips weekends'}
            </p>
          </div>
          <button onClick={stop} className="text-xs text-mist-dim hover:text-danger cursor-pointer shrink-0">
            Stop Recurrence
          </button>
        </div>
        <div className="text-xs text-mist-dim flex flex-col gap-0.5">
          <span>Occurrences so far: {rule.occurrenceCount}</span>
          {rule.maxOccurrences && <span>Ends after {rule.maxOccurrences} occurrences</span>}
          {rule.endDate && <span>Ends {new Date(rule.endDate).toLocaleDateString()}</span>}
          {rule.mode === 'fixed_schedule' && rule.nextRunAt && (
            <span>Next occurrence: {new Date(rule.nextRunAt).toLocaleDateString()}</span>
          )}
        </div>
      </div>
    );
  }

  if (rule && !rule.active) {
    return <p className="text-mist-dim text-sm">Recurrence stopped after {rule.occurrenceCount} occurrences.</p>;
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="hud-btn text-xs px-3 py-1.5 cursor-pointer self-start">
        + Set Recurrence
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex gap-2">
        <select
          autoFocus
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
          className="hud-input flex-1 min-w-0 px-2 py-1.5 text-xs"
        >
          {RECURRENCE_FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {RECURRENCE_FREQUENCY_LABELS[f]}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          className="hud-input w-16 px-2 py-1.5 text-xs"
          aria-label="Interval"
        />
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as RecurrenceMode)}
          className="hud-input px-2 py-1.5 text-xs"
        >
          {RECURRENCE_MODES.map((m) => (
            <option key={m} value={m}>
              {RECURRENCE_MODE_LABELS[m]}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-xs text-mist-dim cursor-pointer">
        <input type="checkbox" checked={skipWeekends} onChange={(e) => setSkipWeekends(e.target.checked)} />
        Skip weekends (business days only)
      </label>
      <div className="flex gap-2">
        <label className="flex flex-col gap-1 text-xs text-mist-dim flex-1">
          End date (optional)
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="hud-input px-2 py-1.5 text-xs"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-mist-dim flex-1">
          Max occurrences (optional)
          <input
            type="number"
            min={1}
            value={maxOccurrences}
            onChange={(e) => setMaxOccurrences(e.target.value)}
            className="hud-input px-2 py-1.5 text-xs"
          />
        </label>
      </div>
      {error && <p className="text-danger text-sm">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={submitting}
          className="hud-btn text-xs px-3 py-1.5 cursor-pointer disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Set Recurrence'}
        </button>
        <button
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
          className="text-xs text-mist-dim hover:text-danger cursor-pointer px-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
