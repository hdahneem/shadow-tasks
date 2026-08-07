import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { SubtaskNode } from '../types';
import { tasksApi } from '../api/services';
import { ProgressBar } from './ProgressBar';

const PRIORITY_COLOR: Record<string, string> = {
  low: '#4ade80',
  medium: '#facc15',
  high: '#f43f5e',
};

export function SubtaskTree({
  parentTaskId,
  listId,
  nodes,
  onChanged,
}: {
  parentTaskId: string;
  listId: string;
  nodes: SubtaskNode[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const addSubtask = async () => {
    if (!draft.trim() || submitting) return;
    setSubmitting(true);
    try {
      await tasksApi.create(listId, { title: draft.trim(), parentTaskId });
      setDraft('');
      setAdding(false);
      onChanged();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {nodes.length > 0 && (
        <div className="flex flex-col gap-1 mb-2">
          {nodes.map((node) => (
            <SubtaskRow key={node.id} node={node} depth={0} onChanged={onChanged} />
          ))}
        </div>
      )}

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addSubtask();
          }}
          className="flex gap-2"
        >
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (!draft.trim()) setAdding(false);
            }}
            placeholder="New subtask..."
            className="hud-input flex-1 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={submitting}
            className="hud-btn text-xs px-3 py-1.5 cursor-pointer disabled:opacity-50"
          >
            Add
          </button>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-xs text-cyan-dim hover:text-cyan-bright cursor-pointer"
        >
          + Add subtask
        </button>
      )}
    </div>
  );
}

function SubtaskRow({ node, depth, onChanged }: { node: SubtaskNode; depth: number; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await tasksApi.update(node.id, { done: !node.done });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${node.title}" and any of its own subtasks?`)) return;
    await tasksApi.remove(node.id);
    onChanged();
  };

  return (
    <div>
      <div
        className="group flex items-center gap-2 py-1.5 border-b border-cyan-dim/10"
        style={{ paddingLeft: depth * 20 }}
      >
        {node.children.length > 0 ? (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-mist-dim hover:text-cyan-bright text-xs w-4 shrink-0 cursor-pointer"
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <button
          onClick={toggle}
          disabled={busy}
          className="shrink-0 w-4 h-4 border cursor-pointer flex items-center justify-center"
          style={{
            borderColor: node.done ? '#4ade80' : 'rgba(34,211,238,0.5)',
            background: node.done ? 'rgba(74,222,128,0.15)' : 'transparent',
          }}
          aria-label={node.done ? 'Mark incomplete' : 'Mark complete'}
        >
          {node.done && <span className="text-[10px]" style={{ color: '#4ade80' }}>✓</span>}
        </button>

        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: PRIORITY_COLOR[node.priority] }}
        />

        <Link
          to={`/tasks/${node.id}`}
          className={`flex-1 min-w-0 truncate text-sm ${node.done ? 'task-strike' : ''}`}
        >
          {node.title}
        </Link>

        {node.children.length > 0 && (
          <span className="w-16 shrink-0 hidden sm:block">
            <ProgressBar value={node.progress} max={100} />
          </span>
        )}

        <button
          onClick={remove}
          className="opacity-0 group-hover:opacity-100 text-mist-dim hover:text-danger text-xs px-1 cursor-pointer shrink-0"
        >
          ✕
        </button>
      </div>

      {expanded && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <SubtaskRow key={child.id} node={child} depth={depth + 1} onChanged={onChanged} />
          ))}
        </div>
      )}
    </div>
  );
}
