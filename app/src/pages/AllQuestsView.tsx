import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { useAuthStore } from '../store/useAuthStore';
import { Panel } from '../components/Panel';
import { TaskRow } from '../components/TaskRow';
import { BulkActionsMenu, type BulkActionMenuItem } from '../components/BulkActionsMenu';
import { BulkListPickerModal } from '../components/BulkListPickerModal';
import { BulkTaskPickerModal } from '../components/BulkTaskPickerModal';
import { BulkAssignModal } from '../components/BulkAssignModal';
import { BulkStatusModal } from '../components/BulkStatusModal';
import { BulkDatesModal } from '../components/BulkDatesModal';
import { tasksToCsv } from '../lib/csv';
import { tagsApi, tasksApi } from '../api/services';
import { errorMessage } from '../api/client';
import { toast } from '../store/useToastStore';
import type { Priority, Tag, Task } from '../types';

type BulkModal = 'assign' | 'status' | 'dates' | 'move' | 'addToList' | 'convertToSubtask' | 'link' | null;

const PAGE_SIZE = 25;

function sortTasks(list: Task[]): Task[] {
  return [...list].sort((a, b) => {
    if (a.done !== b.done) return Number(a.done) - Number(b.done);
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function AllQuestsView() {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const currentWorkspaceId = useStore((s) => s.currentWorkspaceId);
  const projects = useStore((s) => s.projects);
  const bulkSetDone = useStore((s) => s.bulkSetDone);
  const bulkSetPriority = useStore((s) => s.bulkSetPriority);
  const bulkArchive = useStore((s) => s.bulkArchive);
  const bulkDelete = useStore((s) => s.bulkDelete);
  const bulkAddTag = useStore((s) => s.bulkAddTag);
  const bulkAssign = useStore((s) => s.bulkAssign);
  const bulkSetStatus = useStore((s) => s.bulkSetStatus);
  const bulkSetDates = useStore((s) => s.bulkSetDates);
  const bulkMove = useStore((s) => s.bulkMove);
  const bulkCopyToList = useStore((s) => s.bulkCopyToList);
  const bulkConvertToSubtask = useStore((s) => s.bulkConvertToSubtask);
  const bulkDuplicate = useStore((s) => s.bulkDuplicate);
  const bulkLinkTasks = useStore((s) => s.bulkLinkTasks);
  const [showDone, setShowDone] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkModal, setBulkModal] = useState<BulkModal>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [exporting, setExporting] = useState(false);

  const [loadedTasks, setLoadedTasks] = useState<Task[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = (pageNum: number, includeDone: boolean) =>
    tasksApi.listAllPaged({ includeDone, page: pageNum, pageSize: PAGE_SIZE }).then((res) => {
      setLoadedTasks((prev) => (pageNum === 1 ? res.tasks : [...prev, ...res.tasks]));
      setTotal(res.total);
      setPage(pageNum);
    });

  // "Show cleared" changes the underlying server query, so it resets to page 1.
  // "Only mine" has no server param — it's a client-side filter over whatever's
  // already loaded, so toggling it does NOT refetch (see the `sorted` memo below).
  useEffect(() => {
    setLoading(true);
    load(1, showDone).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDone]);

  const loadMore = () => {
    setLoadingMore(true);
    load(page + 1, showDone).finally(() => setLoadingMore(false));
  };

  useEffect(() => {
    if (!currentWorkspaceId) {
      setTags([]);
      return;
    }
    tagsApi.list(currentWorkspaceId).then(setTags).catch(() => {});
  }, [currentWorkspaceId]);

  const sorted = useMemo(() => {
    return sortTasks(loadedTasks.filter((t) => !onlyMine || t.assignees?.some((a) => a.id === currentUserId)));
  }, [loadedTasks, onlyMine, currentUserId]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const exitSelectMode = () => {
    setSelecting(false);
    clearSelection();
  };

  const runBulk = async (fn: () => Promise<void>, apply: (tasks: Task[]) => Task[], removedCount = 0) => {
    setBulkBusy(true);
    try {
      await fn();
      setLoadedTasks(apply);
      if (removedCount) setTotal((t) => Math.max(0, t - removedCount));
      clearSelection();
    } catch {
      // error toast already shown by the store
    } finally {
      setBulkBusy(false);
    }
  };

  // These use Promise.allSettled and manage their own toasts (see
  // bulkResultToast in useStore.ts), so a full refetch — rather than a
  // hand-rolled local-state transform per action — is the simplest way to
  // keep `loadedTasks` in sync after a partial success.
  const runNewBulk = async (fn: () => Promise<void>) => {
    setBulkBusy(true);
    try {
      await fn();
    } finally {
      setBulkBusy(false);
      clearSelection();
      setLoading(true);
      load(1, showDone).finally(() => setLoading(false));
    }
  };

  const selectedCount = selectedIds.size;
  const selectedTasks = useMemo(() => loadedTasks.filter((t) => selectedIds.has(t.id)), [loadedTasks, selectedIds]);

  const sharedProjectId = useMemo(() => {
    const ids = new Set(selectedTasks.map((t) => t.list?.project?.id).filter((id): id is string => !!id));
    return ids.size === 1 ? [...ids][0] : null;
  }, [selectedTasks]);

  const sharedWorkspaceId = useMemo(() => {
    const ids = new Set(
      selectedTasks
        .map((t) => projects.find((p) => p.id === t.list?.project?.id)?.workspaceId)
        .filter((id): id is string => !!id)
    );
    return ids.size === 1 ? [...ids][0] : null;
  }, [selectedTasks, projects]);

  const bulkMenuItems: BulkActionMenuItem[] = [
    {
      key: 'assign',
      label: 'Assign a Hunter',
      onSelect: () => setBulkModal('assign'),
      disabled: !sharedWorkspaceId,
      title: sharedWorkspaceId ? undefined : 'Select quests from a single workspace to assign a hunter.',
    },
    {
      key: 'status',
      label: 'Change Status',
      onSelect: () => setBulkModal('status'),
      disabled: !sharedProjectId,
      title: sharedProjectId ? undefined : 'Select quests from a single project to change status.',
    },
    { key: 'dates', label: 'Change Dates', onSelect: () => setBulkModal('dates') },
    { key: 'move', label: 'Move to List', onSelect: () => setBulkModal('move') },
    { key: 'addToList', label: 'Add to List', onSelect: () => setBulkModal('addToList') },
    { key: 'convertToSubtask', label: 'Convert to Subtask', onSelect: () => setBulkModal('convertToSubtask') },
    { key: 'duplicate', label: 'Duplicate', onSelect: () => runNewBulk(() => bulkDuplicate([...selectedIds])) },
    { key: 'link', label: 'Link Tasks', onSelect: () => setBulkModal('link') },
  ];

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await tasksApi.listAll(showDone);
      const filtered = sortTasks(all.filter((t) => !onlyMine || t.assignees?.some((a) => a.id === currentUserId)));
      const csv = tasksToCsv(filtered);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quests-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not export quests.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto animate-flicker-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-bold text-2xl uppercase tracking-wide text-glow-cyan">
          All Quests
        </h1>
        <div className="flex items-center gap-4">
          {!selecting && (
            <>
              <label className="flex items-center gap-2 text-xs text-mist uppercase tracking-wider cursor-pointer">
                <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
                Only mine
              </label>
              <label className="flex items-center gap-2 text-xs text-mist uppercase tracking-wider cursor-pointer">
                <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
                Show cleared
              </label>
              <button
                onClick={exportCsv}
                disabled={exporting || total === 0}
                className="text-xs text-mist-dim hover:text-cyan-bright cursor-pointer uppercase tracking-wider disabled:opacity-40 disabled:cursor-default"
              >
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
              <button
                onClick={() => setSelecting(true)}
                className="text-xs text-mist-dim hover:text-cyan-bright cursor-pointer uppercase tracking-wider"
              >
                Select
              </button>
            </>
          )}
          {selecting && (
            <button
              onClick={exitSelectMode}
              className="text-xs text-mist-dim hover:text-danger cursor-pointer uppercase tracking-wider"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {selecting && selectedCount > 0 && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 border border-cyan-dim/25 bg-cyan-dim/5 text-xs flex-wrap">
          <span className="text-mist font-mono shrink-0">{selectedCount} selected</span>
          <button
            disabled={bulkBusy}
            onClick={() =>
              runBulk(
                () => bulkSetDone([...selectedIds], true),
                (tasks) => tasks.map((t) => (selectedIds.has(t.id) ? { ...t, done: true } : t))
              )
            }
            className="hud-btn px-2 py-1 cursor-pointer disabled:opacity-50"
          >
            Complete
          </button>
          <button
            disabled={bulkBusy}
            onClick={() =>
              runBulk(
                () => bulkSetDone([...selectedIds], false),
                (tasks) => tasks.map((t) => (selectedIds.has(t.id) ? { ...t, done: false } : t))
              )
            }
            className="hud-btn px-2 py-1 cursor-pointer disabled:opacity-50"
          >
            Incomplete
          </button>
          <select
            disabled={bulkBusy}
            defaultValue=""
            onChange={(e) => {
              const priority = e.target.value as Priority;
              e.target.value = '';
              if (priority) {
                runBulk(
                  () => bulkSetPriority([...selectedIds], priority),
                  (tasks) => tasks.map((t) => (selectedIds.has(t.id) ? { ...t, priority } : t))
                );
              }
            }}
            className="hud-input px-2 py-1 disabled:opacity-50"
          >
            <option value="" disabled>
              Set priority…
            </option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          {tags.length > 0 && (
            <select
              disabled={bulkBusy}
              defaultValue=""
              onChange={(e) => {
                const tagId = e.target.value;
                e.target.value = '';
                const tag = tags.find((t) => t.id === tagId);
                if (tagId && tag) {
                  runBulk(
                    () => bulkAddTag([...selectedIds], tagId),
                    (tasks) =>
                      tasks.map((t) =>
                        selectedIds.has(t.id) && !t.tags?.some((x) => x.id === tagId)
                          ? { ...t, tags: [...(t.tags ?? []), tag] }
                          : t
                      )
                  );
                }
              }}
              className="hud-input px-2 py-1 disabled:opacity-50"
            >
              <option value="" disabled>
                + Tag…
              </option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          )}
          <BulkActionsMenu items={bulkMenuItems} busy={bulkBusy} />
          <button
            disabled={bulkBusy}
            onClick={() => {
              if (confirm(`Archive ${selectedCount} quest${selectedCount === 1 ? '' : 's'}?`)) {
                runBulk(
                  () => bulkArchive([...selectedIds]),
                  (tasks) => tasks.filter((t) => !selectedIds.has(t.id)),
                  selectedIds.size
                );
              }
            }}
            className="hud-btn px-2 py-1 cursor-pointer disabled:opacity-50"
          >
            Archive
          </button>
          <button
            disabled={bulkBusy}
            onClick={() => {
              if (confirm(`Delete ${selectedCount} quest${selectedCount === 1 ? '' : 's'}? This cannot be undone.`)) {
                runBulk(
                  () => bulkDelete([...selectedIds]),
                  (tasks) => tasks.filter((t) => !selectedIds.has(t.id)),
                  selectedIds.size
                );
              }
            }}
            className="text-mist-dim hover:text-danger px-2 py-1 cursor-pointer disabled:opacity-50"
          >
            Delete
          </button>
          <button onClick={clearSelection} className="text-mist-dim hover:text-cyan-bright px-2 py-1 cursor-pointer ml-auto">
            Clear
          </button>
        </div>
      )}

      <Panel>
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-mist-dim font-body">Loading…</p>
        ) : sorted.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-mist-dim font-body">No active quests. Rest up, Hunter.</p>
        ) : (
          sorted.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              subtitle={t.list?.project ? `${t.list.project.name} / ${t.list.name}` : undefined}
              selectable={selecting}
              selected={selectedIds.has(t.id)}
              onToggleSelect={() => toggleSelect(t.id)}
            />
          ))
        )}
      </Panel>

      {loadedTasks.length < total && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="hud-btn w-full mt-3 py-2 text-xs cursor-pointer disabled:opacity-50"
        >
          {loadingMore ? 'Loading…' : 'Load More'}
        </button>
      )}

      {bulkModal === 'assign' && sharedWorkspaceId && (
        <BulkAssignModal
          workspaceId={sharedWorkspaceId}
          onSubmit={(userId) => runNewBulk(() => bulkAssign([...selectedIds], userId))}
          onClose={() => setBulkModal(null)}
        />
      )}
      {bulkModal === 'status' && sharedProjectId && (
        <BulkStatusModal
          projectId={sharedProjectId}
          onSubmit={(statusId) => runNewBulk(() => bulkSetStatus([...selectedIds], statusId))}
          onClose={() => setBulkModal(null)}
        />
      )}
      {bulkModal === 'dates' && (
        <BulkDatesModal
          onSubmit={(patch) => runNewBulk(() => bulkSetDates([...selectedIds], patch))}
          onClose={() => setBulkModal(null)}
        />
      )}
      {bulkModal === 'move' && (
        <BulkListPickerModal
          title="Move to List"
          submitLabel="Move"
          onSubmit={(listId) => runNewBulk(() => bulkMove([...selectedIds], listId))}
          onClose={() => setBulkModal(null)}
        />
      )}
      {bulkModal === 'addToList' && (
        <BulkListPickerModal
          title="Add to List"
          submitLabel="Add"
          onSubmit={(listId) => runNewBulk(() => bulkCopyToList([...selectedIds], listId))}
          onClose={() => setBulkModal(null)}
        />
      )}
      {bulkModal === 'convertToSubtask' && (
        <BulkTaskPickerModal
          title="Convert to Subtask"
          submitLabel="Convert"
          excludeIds={[...selectedIds]}
          onSubmit={(parentTaskId) => runNewBulk(() => bulkConvertToSubtask([...selectedIds], parentTaskId))}
          onClose={() => setBulkModal(null)}
        />
      )}
      {bulkModal === 'link' && (
        <BulkTaskPickerModal
          title="Link Tasks"
          submitLabel="Link"
          excludeIds={[...selectedIds]}
          showRelationType
          onSubmit={(targetTaskId, type) => runNewBulk(() => bulkLinkTasks([...selectedIds], targetTaskId, type!))}
          onClose={() => setBulkModal(null)}
        />
      )}
    </div>
  );
}
