import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { statusesApi, tasksApi, fieldsApi } from '../api/services';
import { FieldControl } from '../components/CustomFieldsPanel';
import type { CustomFieldDefinition, FieldValue, Priority, Status, Task } from '../types';

const PRIORITY_ORDER: Record<Priority, number> = { low: 0, medium: 1, high: 2 };
const PRIORITY_COLOR: Record<Priority, string> = {
  low: '#4ade80',
  medium: '#facc15',
  high: '#f43f5e',
};

type SortKey = 'title' | 'status' | 'priority' | 'dueDate';
type SortDir = 'asc' | 'desc';

// Title is always shown (it's the row's primary link) — every other column is
// user-toggleable and reorderable. Custom fields get a `field:<id>` column id.
const BUILTIN_COLUMNS: { id: string; label: string }[] = [
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'dueDate', label: 'Due Date' },
  { id: 'assignees', label: 'Assignees' },
];

interface ColumnConfig {
  id: string;
  visible: boolean;
}

function columnsStorageKey(projectId: string) {
  return `shadow-tasks:table-columns:${projectId}`;
}

/** Merges the persisted column order/visibility with the current set of available
 * columns — keeping the user's choices for columns that still exist, dropping ones
 * for fields that got deleted, and appending any newly-created fields (visible by
 * default) so they show up without the user having to know to enable them. */
function mergeColumns(persisted: ColumnConfig[], fields: CustomFieldDefinition[]): ColumnConfig[] {
  const availableIds = [...BUILTIN_COLUMNS.map((c) => c.id), ...fields.map((f) => `field:${f.id}`)];
  const availableSet = new Set(availableIds);
  const kept = persisted.filter((c) => availableSet.has(c.id));
  const keptIds = new Set(kept.map((c) => c.id));
  const appended = availableIds.filter((id) => !keptIds.has(id)).map((id) => ({ id, visible: true }));
  return [...kept, ...appended];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function TableView() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const project = useStore((s) => s.projects.find((p) => p.id === projectId));

  const [statuses, setStatuses] = useState<Status[]>([]);
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [columnOverrides, setColumnOverrides] = useState<ColumnConfig[]>(() => {
    if (!projectId) return [];
    const stored = localStorage.getItem(columnsStorageKey(projectId));
    return stored ? JSON.parse(stored) : [];
  });
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement>(null);

  const refetch = useCallback(async () => {
    if (!projectId) return;
    const [s, f, t] = await Promise.all([
      statusesApi.listForProject(projectId),
      fieldsApi.listForProject(projectId),
      tasksApi.listForProject(projectId),
    ]);
    setStatuses(s);
    setFields(f);
    setTasks(t);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    refetch();
  }, [refetch]);

  // Reload the raw (unmerged) preference whenever the project changes — covers
  // navigating between two projects' table views without an intervening unmount.
  useEffect(() => {
    if (!projectId) return;
    const stored = localStorage.getItem(columnsStorageKey(projectId));
    setColumnOverrides(stored ? JSON.parse(stored) : []);
  }, [projectId]);

  useEffect(() => {
    if (!columnsMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) setColumnsMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [columnsMenuOpen]);

  // Derived at render time (not via an effect) so it's always correct for the
  // *current* fields, with no lag while fields are still loading.
  const columns = useMemo(() => mergeColumns(columnOverrides, fields), [columnOverrides, fields]);

  const columnLabel = (id: string) => {
    const builtin = BUILTIN_COLUMNS.find((c) => c.id === id);
    if (builtin) return builtin.label;
    return fields.find((f) => `field:${f.id}` === id)?.name ?? id;
  };

  const persistColumns = (next: ColumnConfig[]) => {
    setColumnOverrides(next);
    if (projectId) localStorage.setItem(columnsStorageKey(projectId), JSON.stringify(next));
  };

  const toggleColumn = (id: string) => {
    persistColumns(columns.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)));
  };

  const moveColumn = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= columns.length) return;
    const next = [...columns];
    [next[index], next[target]] = [next[target], next[index]];
    persistColumns(next);
  };

  const visibleColumns = columns.filter((c) => c.visible);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    const statusName = (t: Task) => statuses.find((s) => s.id === t.statusId)?.name ?? '';
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...tasks].sort((a, b) => {
      switch (sortKey) {
        case 'title':
          return a.title.localeCompare(b.title) * dir;
        case 'status':
          return statusName(a).localeCompare(statusName(b)) * dir;
        case 'priority':
          return (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) * dir;
        case 'dueDate': {
          const at = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const bt = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          return (at - bt) * dir;
        }
        default:
          return 0;
      }
    });
  }, [tasks, sortKey, sortDir, statuses]);

  const changeStatus = async (taskId: string, statusId: string) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, statusId } : t)));
    try {
      const updated = await useStore.getState().setTaskStatus(taskId, statusId);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)));
    } catch {
      // error toast already shown by the store
    } finally {
      useStore.getState().refreshTasks().catch(() => {});
    }
  };

  const changePriority = async (taskId: string, priority: Priority) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, priority } : t)));
    const updated = await tasksApi.update(taskId, { priority });
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)));
  };

  const saveField = async (taskId: string, fieldId: string, value: FieldValue) => {
    const updated = await fieldsApi.setValue(taskId, fieldId, value);
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const customFields = t.customFields ?? [];
        const exists = customFields.some((cf) => cf.id === fieldId);
        return {
          ...t,
          customFields: exists
            ? customFields.map((cf) => (cf.id === fieldId ? updated : cf))
            : [...customFields, updated],
        };
      })
    );
  };

  if (!project) {
    return (
      <div className="max-w-3xl mx-auto animate-flicker-in">
        <p className="text-mist-dim text-sm">Project not found.</p>
      </div>
    );
  }

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  return (
    <div className="animate-flicker-in">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-xs text-mist hover:text-cyan-bright cursor-pointer">
            ← Back
          </button>
          <h1 className="font-display font-bold text-xl uppercase tracking-wide text-glow-cyan">
            {project.name} — Table
          </h1>
        </div>

        <div className="relative" ref={columnsMenuRef}>
          <button
            onClick={() => setColumnsMenuOpen((v) => !v)}
            className="hud-btn text-xs px-3 py-1.5 cursor-pointer"
          >
            Columns
          </button>
          {columnsMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 z-50 bg-void border border-cyan-dim/30 shadow-lg max-h-80 overflow-y-auto">
              <div className="px-3 py-2 border-b border-cyan-dim/15 font-display text-[11px] tracking-widest uppercase text-mist">
                Columns
              </div>
              <div className="px-3 py-2 text-xs text-mist-dim border-b border-cyan-dim/10">Title (always shown)</div>
              <div className="flex flex-col divide-y divide-cyan-dim/10">
                {columns.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-2 px-3 py-1.5">
                    <div className="flex flex-col gap-0 shrink-0">
                      <button
                        onClick={() => moveColumn(i, -1)}
                        disabled={i === 0}
                        aria-label={`Move ${columnLabel(c.id)} up`}
                        className="text-mist-dim hover:text-cyan-bright disabled:opacity-20 text-[9px] leading-none cursor-pointer"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveColumn(i, 1)}
                        disabled={i === columns.length - 1}
                        aria-label={`Move ${columnLabel(c.id)} down`}
                        className="text-mist-dim hover:text-cyan-bright disabled:opacity-20 text-[9px] leading-none cursor-pointer"
                      >
                        ▼
                      </button>
                    </div>
                    <label className="flex-1 flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={c.visible} onChange={() => toggleColumn(c.id)} />
                      {columnLabel(c.id)}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-mist-dim text-sm">Loading table…</p>
      ) : tasks.length === 0 ? (
        <p className="text-mist-dim text-sm">No quests in this project yet.</p>
      ) : (
        <div className="overflow-x-auto hud-panel">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-cyan-dim/20 text-left">
                <Th onClick={() => toggleSort('title')}>Title{sortIndicator('title')}</Th>
                {visibleColumns.map((c) => {
                  switch (c.id) {
                    case 'status':
                      return (
                        <Th key={c.id} onClick={() => toggleSort('status')}>
                          Status{sortIndicator('status')}
                        </Th>
                      );
                    case 'priority':
                      return (
                        <Th key={c.id} onClick={() => toggleSort('priority')}>
                          Priority{sortIndicator('priority')}
                        </Th>
                      );
                    case 'dueDate':
                      return (
                        <Th key={c.id} onClick={() => toggleSort('dueDate')}>
                          Due Date{sortIndicator('dueDate')}
                        </Th>
                      );
                    case 'assignees':
                      return <Th key={c.id}>Assignees</Th>;
                    default:
                      return <Th key={c.id}>{columnLabel(c.id)}</Th>;
                  }
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((task) => (
                <tr key={task.id} className="border-b border-cyan-dim/10 hover:bg-cyan-dim/5">
                  <td className="px-3 py-2">
                    <Link
                      to={`/tasks/${task.id}`}
                      className={`hover:text-cyan-bright ${task.done ? 'task-strike text-mist-dim' : ''}`}
                    >
                      {task.title}
                    </Link>
                  </td>
                  {visibleColumns.map((c) => {
                    switch (c.id) {
                      case 'status':
                        return (
                          <td key={c.id} className="px-3 py-2">
                            <select
                              value={task.statusId ?? ''}
                              onChange={(e) => changeStatus(task.id, e.target.value)}
                              className="hud-input text-xs px-2 py-1 cursor-pointer"
                            >
                              <option value="" disabled>
                                Unsorted
                              </option>
                              {statuses.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      case 'priority':
                        return (
                          <td key={c.id} className="px-3 py-2">
                            <select
                              value={task.priority}
                              onChange={(e) => changePriority(task.id, e.target.value as Priority)}
                              className="hud-input text-xs px-2 py-1 cursor-pointer"
                              style={{ color: PRIORITY_COLOR[task.priority] }}
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                          </td>
                        );
                      case 'dueDate':
                        return (
                          <td key={c.id} className="px-3 py-2 font-mono text-xs text-mist-dim">
                            {task.dueDate ? formatDate(task.dueDate) : '—'}
                          </td>
                        );
                      case 'assignees':
                        return (
                          <td key={c.id} className="px-3 py-2 text-xs text-mist-dim">
                            {(task.assignees ?? []).map((a) => a.name).join(', ') || '—'}
                          </td>
                        );
                      default: {
                        const fieldId = c.id.replace('field:', '');
                        const f = fields.find((fd) => fd.id === fieldId);
                        if (!f) return <td key={c.id} />;
                        const tf = task.customFields?.find((cf) => cf.id === f.id);
                        return (
                          <td key={c.id} className="px-3 py-2 text-xs min-w-[8rem]">
                            <FieldControl
                              field={{
                                id: f.id,
                                name: f.name,
                                type: f.type,
                                options: f.options,
                                value: tf?.value ?? null,
                              }}
                              onSave={(value) => saveField(task.id, f.id, value)}
                            />
                          </td>
                        );
                      }
                    }
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-2 font-display text-[11px] tracking-widest uppercase text-mist whitespace-nowrap ${
        onClick ? 'cursor-pointer select-none hover:text-cyan-bright' : ''
      }`}
    >
      {children}
    </th>
  );
}
