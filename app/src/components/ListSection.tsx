import { useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import type { TodoList } from '../types';
import { parseTasksCsv } from '../lib/csvImport';
import { useIsOnline } from '../lib/useIsOnline';
import { toast } from '../store/useToastStore';
import { Panel } from './Panel';
import { TaskRow } from './TaskRow';
import { ProgressBar } from './ProgressBar';
import { TaskModal } from './TaskModal';
import { CreateTaskFromTemplateModal } from './CreateTaskFromTemplateModal';

export function ListSection({
  list,
  canEdit = true,
  selectable = false,
  selectedIds,
  onToggleSelect,
}: {
  list: TodoList;
  canEdit?: boolean;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const allTasks = useStore((s) => s.tasks);
  const tasks = useMemo(() => allTasks.filter((t) => t.listId === list.id), [allTasks, list.id]);
  const deleteList = useStore((s) => s.deleteList);
  const renameList = useStore((s) => s.renameList);
  const addTask = useStore((s) => s.addTask);
  const reorderTask = useStore((s) => s.reorderTask);
  const isOnline = useIsOnline();
  const [creating, setCreating] = useState(false);
  const [creatingFromTemplate, setCreatingFromTemplate] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(list.name);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = async (file: File) => {
    setImportMessage(null);
    const text = await file.text();
    let rows: ReturnType<typeof parseTasksCsv>;
    try {
      rows = parseTasksCsv(text);
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : 'Could not parse that CSV.');
      return;
    }
    if (rows.length === 0) {
      setImportMessage('No tasks found in that CSV.');
      return;
    }
    setImporting(true);
    try {
      await Promise.all(rows.map((r) => addTask(list.id, r.title, r.priority ?? 'medium', r.dueDate)));
      setImportMessage(`Imported ${rows.length} quest${rows.length === 1 ? '' : 's'}.`);
    } catch {
      setImportMessage('Import failed partway through — some quests may not have been created.');
    } finally {
      setImporting(false);
    }
  };

  const done = tasks.filter((t) => t.done).length;
  const sorted = [...tasks].sort((a, b) => {
    if (a.done !== b.done) return Number(a.done) - Number(b.done);
    if (!a.done) return a.position - b.position;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const handleDrop = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    if (!isOnline) {
      // Reordering has no offline queue — it optimistically applies before the
      // API call resolves, and a failed request here wouldn't revert that, so a
      // silently-desynced position is worse than just refusing the drop.
      toast.error("You're offline — reordering needs a connection.");
      return;
    }
    const withoutDragged = sorted.filter((t) => t.id !== draggingId);
    const targetIdx = withoutDragged.findIndex((t) => t.id === targetId);
    if (targetIdx === -1) return;
    const target = withoutDragged[targetIdx];
    const prev = withoutDragged[targetIdx - 1];
    const newPosition = prev ? (prev.position + target.position) / 2 : target.position - 1;
    reorderTask(draggingId, newPosition).catch(() => {});
  };

  return (
    <Panel className="mb-6">
      <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-dim/20">
        {renaming ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              if (nameDraft.trim()) renameList(list.id, nameDraft.trim()).catch(() => {});
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="hud-input px-2 py-1 text-sm flex-1 mr-3"
          />
        ) : (
          <button
            onClick={() => setRenaming(true)}
            className="font-display font-bold tracking-widest uppercase text-sm text-cyan-bright cursor-pointer"
          >
            {list.name}
          </button>
        )}
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono text-xs text-mist">
            {done}/{tasks.length}
          </span>
          {canEdit && (
            <>
              <button
                onClick={() => setCreating(true)}
                className="hud-btn text-xs px-3 py-1 cursor-pointer"
              >
                + Task
              </button>
              <button
                onClick={() => setCreatingFromTemplate(true)}
                className="hud-btn text-xs px-3 py-1 cursor-pointer"
              >
                From Template
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) handleImportFile(file);
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="hud-btn text-xs px-3 py-1 cursor-pointer disabled:opacity-50"
              >
                {importing ? 'Importing…' : 'Import CSV'}
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete list "${list.name}"?`)) deleteList(list.id).catch(() => {});
                }}
                className="text-mist-dim hover:text-danger text-xs cursor-pointer"
              >
                ✕
              </button>
            </>
          )}
        </div>
      </div>

      {importMessage && (
        <p className="px-4 pt-2 text-xs text-cyan-bright font-body">{importMessage}</p>
      )}

      {tasks.length > 0 && (
        <div className="px-4 pt-3">
          <ProgressBar value={done} max={tasks.length} />
        </div>
      )}

      <div>
        {sorted.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-mist-dim font-body">
            No tasks yet. Add one to begin the quest.
          </p>
        ) : (
          sorted.map((t) => {
            const row = (
              <TaskRow
                task={t}
                selectable={selectable}
                selected={selectedIds?.has(t.id) ?? false}
                onToggleSelect={() => onToggleSelect?.(t.id)}
              />
            );
            // Dragging and selection checkboxes both live on the row wrapper
            // (there's no separate drag handle), so drag is disabled while
            // selection mode is active to avoid the two gestures conflicting.
            if (!canEdit || selectable) return <div key={t.id}>{row}</div>;
            return (
              <div
                key={t.id}
                draggable
                onDragStart={() => setDraggingId(t.id)}
                onDragEnd={() => setDraggingId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(t.id);
                }}
                className={draggingId === t.id ? 'opacity-40' : undefined}
              >
                {row}
              </div>
            );
          })
        )}
      </div>

      {creating && <TaskModal listId={list.id} onClose={() => setCreating(false)} />}
      {creatingFromTemplate && (
        <CreateTaskFromTemplateModal listId={list.id} onClose={() => setCreatingFromTemplate(false)} />
      )}
    </Panel>
  );
}
