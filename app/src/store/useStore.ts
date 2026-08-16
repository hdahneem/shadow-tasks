import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Folder,
  Project,
  TodoList,
  Task,
  Rank,
  Priority,
  Workspace,
  SyncStatus,
  TodayEntryStatus,
  RelationType,
} from '../types';
import { PRIORITY_XP } from '../types';
import {
  foldersApi,
  projectsApi,
  listsApi,
  tasksApi,
  projectTemplatesApi,
  taskTemplatesApi,
  workspacesApi,
  taskTagsApi,
  todayApi,
  assigneesApi,
  relationsApi,
  type TaskUpdateInput,
} from '../api/services';
import { errorMessage, ApiError } from '../api/client';
import { toast } from './useToastStore';
import { appendOp, replayQueue, type PendingOp } from './offlineQueue';
import { newlyUnlockedBadges } from '../lib/badges';
import { decideReconciliation } from '../lib/reconcile';
import { useAuthStore } from './useAuthStore';

export type SyncState = 'idle' | 'syncing' | 'error';

// Throttles background/automatic sync checks so reconnect/app-resume events
// firing in quick succession don't spam the server — a manual trigger (pull-to-
// refresh, the status indicator, initial mount) always bypasses this via force.
const MIN_AUTO_SYNC_INTERVAL_MS = 60_000;
let lastAutoSyncAt = 0;

// Superlinear curve (power > 1) so each level costs meaningfully more than the
// last — early ranks (D/C) come within days of casual use, while S-Rank and the
// prestige tier beyond it (Epic/Legendary/Mythic, see badges.ts) demand months
// of sustained effort. Tuned so Mythic Monarch (level 100) stays a genuine
// long-term achievement rather than either a quick grind or a practical wall.
export function xpForLevel(level: number): number {
  return Math.round(90 + 4 * Math.pow(level - 1, 1.35));
}

export function rankForLevel(level: number): Rank {
  if (level >= 50) return 'S';
  if (level >= 40) return 'A';
  if (level >= 30) return 'B';
  if (level >= 20) return 'C';
  if (level >= 10) return 'D';
  return 'E';
}

type Hunter = { level: number; xp: number; tasksCompleted: number; highestLevel: number };

/** Old persisted state predates highestLevel; the current level is always a safe floor for it. */
export function highestLevelOf(hunter: Hunter): number {
  return Math.max(hunter.highestLevel ?? hunter.level, hunter.level);
}

/**
 * Hunter stats are fully derived from completed tasks — active and archived —
 * rather than tracked as an independent incrementally-updated counter. That
 * means every device converges on the same Level/XP/Total Cleared as soon as
 * it has synced task data, instead of each device keeping its own local-only
 * tally that drifts the moment a completion happens somewhere else (see the
 * store-wide subscribe below, which is what actually keeps this in sync after
 * every mutation). Archived tasks have to be included alongside active ones
 * because archiving a completed quest shouldn't cost you XP.
 */
function deriveHunterStats(tasks: Task[], archivedTasks: Task[], highestLevelFloor: number): Hunter {
  let tasksCompleted = 0;
  let totalXp = 0;
  for (const t of tasks) {
    if (t.done) {
      tasksCompleted += 1;
      totalXp += PRIORITY_XP[t.priority];
    }
  }
  for (const t of archivedTasks) {
    if (t.done) {
      tasksCompleted += 1;
      totalXp += PRIORITY_XP[t.priority];
    }
  }

  let level = 1;
  let xp = totalXp;
  let need = xpForLevel(level);
  while (xp >= need) {
    xp -= need;
    level += 1;
    need = xpForLevel(level);
  }

  // Badges earned at a past peak level stay earned even if XP is later reversed
  // (e.g. deleting a completed task) — a reward system that could revoke
  // itself wouldn't feel like a reward.
  const highestLevel = Math.max(highestLevelFloor, level);
  return { level, xp, tasksCompleted, highestLevel };
}

/**
 * Surfaces XP gains to the player. Only fires on a positive delta (completing,
 * not un-completing) — reversing a checkbox shouldn't announce a "gain". Badge
 * unlocks take priority over a plain level-up, which takes priority over a
 * plain XP toast, so a single completion never shows more than one summary.
 */
function notifyXpGain(before: Hunter, after: Hunter, xpDelta: number) {
  if (xpDelta <= 0) return;
  const unlocked = newlyUnlockedBadges(highestLevelOf(before), highestLevelOf(after));
  if (unlocked.length > 0) {
    for (const badge of unlocked) {
      toast.success(`+${xpDelta} XP — Badge Unlocked: ${badge.name}!`);
    }
    return;
  }
  if (after.level > before.level) {
    toast.success(`+${xpDelta} XP — Level Up! Now Level ${after.level} (${rankForLevel(after.level)}-Rank)`);
    return;
  }
  toast.success(`+${xpDelta} XP`);
}

/**
 * Shared completion feedback for the newer bulk actions (assign, status, dates,
 * move, copy, convert-to-subtask, duplicate, link), which — unlike the older
 * bulk* actions — use Promise.allSettled instead of Promise.all so a single
 * failure doesn't discard successes for the rest of the batch. Always surfaces
 * an outcome (per the "provide feedback ... or if any tasks could not be
 * updated" requirement) instead of silently succeeding or throwing.
 */
function bulkResultToast(pastTenseVerb: string, succeeded: number, total: number) {
  const failed = total - succeeded;
  const noun = (n: number) => `${n} quest${n === 1 ? '' : 's'}`;
  if (succeeded === 0) {
    toast.error(`Could not update ${noun(total)}.`);
  } else if (failed > 0) {
    toast.error(`${pastTenseVerb} ${succeeded} of ${total} quests — ${failed} failed.`);
  } else {
    toast.success(`${pastTenseVerb} ${noun(succeeded)}.`);
  }
}

interface StoreState {
  folders: Folder[];
  projects: Project[];
  lists: TodoList[];
  tasks: Task[];
  // Kept alongside `tasks` purely so Hunter stats can count completed quests
  // that have since been archived (see deriveHunterStats) — not used to render
  // any list view, which fetches its own paginated archived set separately.
  archivedTasks: Task[];
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  loaded: boolean;
  loading: boolean;
  hunter: Hunter;
  pendingOps: PendingOp[];
  lastSyncSignature: SyncStatus | null;
  // A one-shot signal for whoever's looking at a temp-id task's detail page when it
  // syncs mid-visit — TaskDetail watches for its own taskId showing up here and
  // navigates to the real id. Deliberately not persisted; it's only meaningful for
  // whatever's mounted right now.
  lastResolvedTempId: { tempId: string; realId: string } | null;
  // Drives the connection/sync status indicator. Transient — not persisted, since
  // "syncing" or a stale error shouldn't survive a reload.
  syncState: SyncState;
  lastSyncedAt: number | null;
  syncConflict: { localChangedAt: number; serverChangedAt: string | null } | null;
  // Per-user, resets daily on the server (see backend TodayListEntry) — keyed by
  // taskId for O(1) lookups from lib/todaySuggestions.ts and TaskRow-adjacent UI.
  todayEntries: Record<string, TodayEntryStatus>;

  loadAll: () => Promise<void>;
  loadTodayEntries: () => Promise<void>;
  setTodayEntry: (taskId: string, status: TodayEntryStatus) => Promise<void>;
  replayPendingOps: () => Promise<void>;
  discardPendingOps: () => void;
  recordSyncSignature: (sig: SyncStatus) => void;
  // The single entry point for reconciling with the server — used both by
  // SyncManager's automatic triggers (reconnect, app-resume, mount) and by
  // manual ones (pull-to-refresh, the status indicator's click-to-sync).
  // `force` bypasses the background-check throttle; manual triggers always pass it.
  triggerSync: (force?: boolean) => Promise<void>;
  dismissSyncConflict: () => void;
  reset: () => void;
  setCurrentWorkspace: (id: string) => void;
  createWorkspace: (name: string) => Promise<string>;
  renameWorkspace: (id: string, name: string) => Promise<void>;

  addFolder: (name: string, color: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;

  addProject: (name: string, folderId: string | null, rank: Rank, description?: string) => Promise<string>;
  createProjectFromTemplate: (
    templateId: string,
    name: string,
    folderId: string | null,
    rank: Rank,
    description?: string
  ) => Promise<string>;
  updateProject: (id: string, patch: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  addList: (name: string, projectId: string) => Promise<string>;
  renameList: (id: string, name: string) => Promise<void>;
  deleteList: (id: string) => Promise<void>;

  addTask: (listId: string, title: string, priority: Priority, dueDate?: string, notes?: string) => Promise<void>;
  createTask: (
    listId: string,
    input: { title: string; priority?: Priority; dueDate?: string; description?: string; parentTaskId?: string }
  ) => Promise<Task>;
  createTaskFromTemplate: (templateId: string, listId: string) => Promise<string>;
  toggleTask: (id: string) => Promise<void>;
  setTaskStatus: (id: string, statusId: string) => Promise<Task>;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
  reorderTask: (id: string, position: number) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  refreshTasks: () => Promise<void>;

  bulkSetDone: (ids: string[], done: boolean) => Promise<void>;
  bulkSetPriority: (ids: string[], priority: Priority) => Promise<void>;
  bulkArchive: (ids: string[]) => Promise<void>;
  bulkDelete: (ids: string[]) => Promise<void>;
  bulkAddTag: (ids: string[], tagId: string) => Promise<void>;
  bulkAssign: (ids: string[], userId: string) => Promise<void>;
  bulkSetStatus: (ids: string[], statusId: string) => Promise<void>;
  bulkSetDates: (ids: string[], patch: { startDate?: string | null; dueDate?: string | null }) => Promise<void>;
  bulkMove: (ids: string[], listId: string) => Promise<void>;
  bulkCopyToList: (ids: string[], listId: string) => Promise<void>;
  bulkConvertToSubtask: (ids: string[], parentTaskId: string) => Promise<void>;
  bulkDuplicate: (ids: string[]) => Promise<void>;
  bulkLinkTasks: (ids: string[], targetTaskId: string, type: RelationType) => Promise<void>;
}

const emptyHunter: Hunter = { level: 1, xp: 0, tasksCompleted: 0, highestLevel: 1 };

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      folders: [],
      projects: [],
      lists: [],
      tasks: [],
      archivedTasks: [],
      workspaces: [],
      currentWorkspaceId: null,
      loaded: false,
      loading: false,
      hunter: emptyHunter,
      pendingOps: [],
      lastSyncSignature: null,
      lastResolvedTempId: null,
      syncState: 'idle',
      lastSyncedAt: null,
      syncConflict: null,
      todayEntries: {},

      loadAll: async () => {
        if (get().loading) return;
        set({ loading: true });
        try {
          const [folders, projects, lists, tasks, archivedTasks, workspaces, today] = await Promise.all([
            foldersApi.list(),
            projectsApi.list(),
            listsApi.listAll(),
            tasksApi.listAll(true),
            tasksApi.listAll(true, true),
            workspacesApi.list(),
            todayApi.list(),
          ]);
          const persistedId = get().currentWorkspaceId;
          const currentWorkspaceId = workspaces.some((w) => w.id === persistedId)
            ? persistedId
            : (workspaces[0]?.id ?? null);
          const todayEntries = Object.fromEntries(today.entries.map((e) => [e.taskId, e.status]));
          set({
            folders,
            projects,
            lists,
            tasks,
            archivedTasks,
            workspaces,
            currentWorkspaceId,
            todayEntries,
            loaded: true,
            loading: false,
          });
        } catch (err) {
          set({ loading: false });
          throw err;
        }
      },

      loadTodayEntries: async () => {
        const { entries } = await todayApi.list();
        set({ todayEntries: Object.fromEntries(entries.map((e) => [e.taskId, e.status])) });
      },

      // Optimistic-then-revert like updateTask, but intentionally does not
      // participate in the offline mutation queue (see offlineQueue.ts) — this
      // is a personal, low-stakes preference rather than task content, so the
      // UI gates the add/accept/dismiss controls behind useIsOnline() instead
      // (same pattern as other out-of-scope-for-offline actions) rather than
      // extending the queue/reconciliation system for it.
      setTodayEntry: async (taskId, status) => {
        const previous = get().todayEntries[taskId];
        set((s) => ({ todayEntries: { ...s.todayEntries, [taskId]: status } }));
        try {
          await todayApi.setStatus(taskId, status);
        } catch (err) {
          set((s) => {
            const next = { ...s.todayEntries };
            if (previous) next[taskId] = previous;
            else delete next[taskId];
            return { todayEntries: next };
          });
          toast.error(errorMessage(err, 'Could not update your Today list.'));
          throw err;
        }
      },

      // replayPendingOps/discardPendingOps/recordSyncSignature are the primitives;
      // triggerSync below is the orchestration that decides when/how to use them.
      // SyncManager calls triggerSync from its automatic triggers (reconnect,
      // app-resume, mount); pull-to-refresh and the status indicator call it
      // directly as a manual, always-forced trigger.
      replayPendingOps: async () => {
        const ops = get().pendingOps;
        if (ops.length === 0) return;
        await replayQueue(
          ops,
          (localId, task) => {
            set((s) => ({ tasks: s.tasks.map((t) => (t.id === localId ? task : t)) }));
            if (localId !== task.id) set({ lastResolvedTempId: { tempId: localId, realId: task.id } });
          },
          (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }))
        );
        set({ pendingOps: [] });
      },
      discardPendingOps: () => set({ pendingOps: [] }),
      recordSyncSignature: (sig) => set({ lastSyncSignature: sig }),

      triggerSync: async (force = false) => {
        if (useAuthStore.getState().status !== 'authenticated' || !navigator.onLine) return;
        const now = Date.now();
        if (!force && now - lastAutoSyncAt < MIN_AUTO_SYNC_INTERVAL_MS) return;
        lastAutoSyncAt = now;

        set({ syncState: 'syncing' });
        try {
          const current = await tasksApi.syncStatus();
          const decision = decideReconciliation(get().pendingOps, get().lastSyncSignature, current);
          if (decision.kind === 'silent-refresh') {
            await get().loadAll();
            get().recordSyncSignature(current);
          } else if (decision.kind === 'auto-replay') {
            await get().replayPendingOps();
            await get().loadAll();
            get().recordSyncSignature(current);
          } else {
            set({ syncConflict: { localChangedAt: decision.localChangedAt, serverChangedAt: decision.serverChangedAt } });
          }
          set({ syncState: 'idle', lastSyncedAt: Date.now() });
        } catch {
          // syncState('error') is the only failure signal — SyncStatusIndicator
          // surfaces it, so no caller here needs a rejected promise to handle too.
          set({ syncState: 'error' });
        }
      },
      dismissSyncConflict: () => set({ syncConflict: null }),

      reset: () =>
        set({
          folders: [],
          projects: [],
          lists: [],
          tasks: [],
          archivedTasks: [],
          workspaces: [],
          loaded: false,
          hunter: emptyHunter,
          pendingOps: [],
          lastSyncSignature: null,
          lastResolvedTempId: null,
          syncState: 'idle',
          lastSyncedAt: null,
          syncConflict: null,
          todayEntries: {},
        }),

      setCurrentWorkspace: (id) => set({ currentWorkspaceId: id }),

      createWorkspace: async (name) => {
        const workspace = await workspacesApi.create(name);
        set((s) => ({ workspaces: [...s.workspaces, workspace], currentWorkspaceId: workspace.id }));
        return workspace.id;
      },
      renameWorkspace: async (id, name) => {
        try {
          const updated = await workspacesApi.rename(id, name);
          set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === id ? updated : w)) }));
        } catch (err) {
          toast.error(errorMessage(err, 'Could not rename workspace.'));
          throw err;
        }
      },

      addFolder: async (name, color) => {
        const workspaceId = get().currentWorkspaceId;
        if (!workspaceId) throw new Error('No active workspace');
        const folder = await foldersApi.create(name, color, workspaceId);
        set((s) => ({ folders: [...s.folders, folder] }));
      },
      renameFolder: async (id, name) => {
        try {
          const updated = await foldersApi.update(id, { name });
          set((s) => ({ folders: s.folders.map((f) => (f.id === id ? updated : f)) }));
        } catch (err) {
          toast.error(errorMessage(err, 'Could not rename folder.'));
          throw err;
        }
      },
      deleteFolder: async (id) => {
        try {
          await foldersApi.remove(id);
          const [projects, lists, tasks] = await Promise.all([
            projectsApi.list(),
            listsApi.listAll(),
            tasksApi.listAll(true),
          ]);
          set((s) => ({ folders: s.folders.filter((f) => f.id !== id), projects, lists, tasks }));
        } catch (err) {
          toast.error(errorMessage(err, 'Could not delete folder.'));
          throw err;
        }
      },

      addProject: async (name, folderId, rank, description) => {
        const workspaceId = get().currentWorkspaceId;
        if (!workspaceId) throw new Error('No active workspace');
        const project = await projectsApi.create({ name, folderId, rank, description, workspaceId });
        set((s) => ({ projects: [...s.projects, project] }));
        return project.id;
      },
      createProjectFromTemplate: async (templateId, name, folderId, rank, description) => {
        const workspaceId = get().currentWorkspaceId;
        if (!workspaceId) throw new Error('No active workspace');
        const project = await projectTemplatesApi.createProject(templateId, {
          name,
          folderId,
          rank,
          description,
          workspaceId,
        });
        const lists = await listsApi.listAll();
        set((s) => ({ projects: [...s.projects, project], lists }));
        return project.id;
      },
      updateProject: async (id, patch) => {
        try {
          const updated = await projectsApi.update(id, patch);
          set((s) => ({ projects: s.projects.map((p) => (p.id === id ? updated : p)) }));
        } catch (err) {
          toast.error(errorMessage(err, 'Could not update project.'));
          throw err;
        }
      },
      deleteProject: async (id) => {
        try {
          await projectsApi.remove(id);
          const [lists, tasks] = await Promise.all([listsApi.listAll(), tasksApi.listAll(true)]);
          set((s) => ({ projects: s.projects.filter((p) => p.id !== id), lists, tasks }));
        } catch (err) {
          toast.error(errorMessage(err, 'Could not delete project.'));
          throw err;
        }
      },

      addList: async (name, projectId) => {
        try {
          const list = await listsApi.create(projectId, name);
          set((s) => ({ lists: [...s.lists, list] }));
          return list.id;
        } catch (err) {
          toast.error(errorMessage(err, 'Could not create list.'));
          throw err;
        }
      },
      renameList: async (id, name) => {
        try {
          const updated = await listsApi.rename(id, name);
          set((s) => ({ lists: s.lists.map((l) => (l.id === id ? updated : l)) }));
        } catch (err) {
          toast.error(errorMessage(err, 'Could not rename list.'));
          throw err;
        }
      },
      deleteList: async (id) => {
        try {
          await listsApi.remove(id);
          const tasks = await tasksApi.listAll(true);
          set((s) => ({ lists: s.lists.filter((l) => l.id !== id), tasks }));
        } catch (err) {
          toast.error(errorMessage(err, 'Could not delete list.'));
          throw err;
        }
      },

      addTask: async (listId, title, priority, dueDate, notes) => {
        const isoDueDate = dueDate ? new Date(dueDate).toISOString() : undefined;
        const queueOffline = () => {
          const tempId = `temp-${crypto.randomUUID()}`;
          const siblingPositions = get()
            .tasks.filter((t) => t.listId === listId)
            .map((t) => t.position);
          const nowIso = new Date().toISOString();
          const optimisticTask: Task = {
            id: tempId,
            listId,
            parentTaskId: null,
            title,
            priority,
            done: false,
            position: siblingPositions.length > 0 ? Math.max(...siblingPositions) + 1 : 0,
            dueDate: isoDueDate,
            description: notes,
            createdAt: nowIso,
            updatedAt: nowIso,
            progress: 0,
          };
          set((s) => ({
            tasks: [...s.tasks, optimisticTask],
            pendingOps: appendOp(s.pendingOps, {
              id: crypto.randomUUID(),
              kind: 'create',
              tempId,
              listId,
              payload: { title, priority, dueDate: isoDueDate, description: notes },
              createdAt: Date.now(),
            }),
          }));
        };
        if (!navigator.onLine) {
          queueOffline();
          return;
        }
        try {
          const task = await tasksApi.create(listId, { title, priority, dueDate: isoDueDate, description: notes });
          set((s) => ({ tasks: [...s.tasks, task] }));
        } catch (err) {
          // navigator.onLine is unreliable on some WebViews (observed: stays true
          // even with radios fully off) — a raw fetch failure is a more trustworthy
          // signal that the request never reached the server, so treat it the same
          // as being offline rather than surfacing a dead-end error.
          if (!(err instanceof ApiError)) {
            queueOffline();
            return;
          }
          throw err;
        }
      },
      // Online-only sibling to addTask, for callers (e.g. hierarchical CSV
      // import) that need the created task back and must keep going after a
      // per-item failure rather than have the store show a toast and throw —
      // deliberately doesn't touch addTask's offline-queue logic.
      createTask: async (listId, input) => {
        const task = await tasksApi.create(listId, input);
        set((s) => ({ tasks: [...s.tasks, task] }));
        return task;
      },
      createTaskFromTemplate: async (templateId, listId) => {
        const task = await taskTemplatesApi.createTask(templateId, listId);
        set((s) => ({ tasks: [...s.tasks, task] }));
        return task.id;
      },

      toggleTask: async (id) => {
        const task = get().tasks.find((t) => t.id === id);
        if (!task) return;
        const nowDone = !task.done;
        const xpDelta = PRIORITY_XP[task.priority] * (nowDone ? 1 : -1);
        const queueOffline = () => {
          const before = get().hunter;
          set((s) => ({
            tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: nowDone, updatedAt: new Date().toISOString() } : t)),
            pendingOps: appendOp(s.pendingOps, {
              id: crypto.randomUUID(),
              kind: 'toggleDone',
              taskId: id,
              done: nowDone,
              createdAt: Date.now(),
            }),
          }));
          notifyXpGain(before, get().hunter, xpDelta);
        };
        if (!navigator.onLine) {
          queueOffline();
          return;
        }
        try {
          const before = get().hunter;
          const updated = await tasksApi.update(id, { done: nowDone });
          set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
          notifyXpGain(before, get().hunter, xpDelta);
        } catch (err) {
          // See addTask: a raw fetch failure means the request never reached the
          // server, which is a more reliable "actually offline" signal than
          // navigator.onLine on WebViews where it doesn't track real radio state.
          if (!(err instanceof ApiError)) {
            queueOffline();
            return;
          }
          toast.error(errorMessage(err, 'Could not update quest.'));
          throw err;
        }
      },

      // Used by the status dropdown and the Kanban board — any path that can move
      // a task onto/off a "counts as done" status grants/reverses XP the same way
      // the checkbox does, keyed off the task's *previous* known done state.
      setTaskStatus: async (id, statusId) => {
        const beforeTask = get().tasks.find((t) => t.id === id);
        try {
          const before = get().hunter;
          const updated = await tasksApi.setStatus(id, statusId);
          set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
          if (beforeTask && beforeTask.done !== updated.done) {
            const xpDelta = PRIORITY_XP[beforeTask.priority] * (updated.done ? 1 : -1);
            notifyXpGain(before, get().hunter, xpDelta);
          }
          return updated;
        } catch (err) {
          toast.error(errorMessage(err, 'Could not update quest status.'));
          throw err;
        }
      },

      updateTask: async (id, patch) => {
        const queueOffline = () => {
          set((s) => ({
            tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t)),
            pendingOps: appendOp(s.pendingOps, {
              id: crypto.randomUUID(),
              kind: 'update',
              taskId: id,
              patch: patch as TaskUpdateInput,
              createdAt: Date.now(),
            }),
          }));
        };
        if (!navigator.onLine) {
          queueOffline();
          return;
        }
        try {
          const updated = await tasksApi.update(id, patch);
          set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
        } catch (err) {
          if (!(err instanceof ApiError)) {
            queueOffline();
            return;
          }
          toast.error(errorMessage(err, 'Could not update quest.'));
          throw err;
        }
      },
      reorderTask: async (id, position) => {
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, position } : t)) }));
        try {
          const updated = await tasksApi.reorder(id, { position });
          set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
        } catch (err) {
          toast.error(errorMessage(err, 'Could not reorder quest.'));
          throw err;
        }
      },
      deleteTask: async (id) => {
        const queueOffline = () => {
          set((s) => ({
            tasks: s.tasks.filter((t) => t.id !== id),
            pendingOps: appendOp(s.pendingOps, {
              id: crypto.randomUUID(),
              kind: 'delete',
              taskId: id,
              createdAt: Date.now(),
            }),
          }));
        };
        if (!navigator.onLine) {
          queueOffline();
          return;
        }
        try {
          await tasksApi.remove(id);
          set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
        } catch (err) {
          if (!(err instanceof ApiError)) {
            queueOffline();
            return;
          }
          toast.error(errorMessage(err, 'Could not delete quest.'));
          throw err;
        }
      },
      refreshTasks: async () => {
        const [tasks, archivedTasks] = await Promise.all([tasksApi.listAll(true), tasksApi.listAll(true, true)]);
        set({ tasks, archivedTasks });
      },

      // Bulk actions reuse the single-task endpoints in parallel — task lists in this
      // app are small enough that N requests is simpler and safer than adding a
      // dedicated batch API, and per-task permission checks stay intact for free.
      bulkSetDone: async (ids, done) => {
        const targets = get().tasks.filter((t) => ids.includes(t.id) && t.done !== done);
        if (targets.length === 0) return;
        try {
          const before = get().hunter;
          const updated = await Promise.all(targets.map((t) => tasksApi.update(t.id, { done })));
          const byId = new Map(updated.map((u) => [u.id, u]));
          set((s) => ({ tasks: s.tasks.map((t) => byId.get(t.id) ?? t) }));
          const xpDelta = targets.reduce((sum, t) => sum + PRIORITY_XP[t.priority] * (done ? 1 : -1), 0);
          notifyXpGain(before, get().hunter, xpDelta);
        } catch (err) {
          toast.error(errorMessage(err, 'Could not update quests.'));
          throw err;
        }
      },
      bulkSetPriority: async (ids, priority) => {
        try {
          const updated = await Promise.all(ids.map((id) => tasksApi.update(id, { priority })));
          const byId = new Map(updated.map((u) => [u.id, u]));
          set((s) => ({ tasks: s.tasks.map((t) => byId.get(t.id) ?? t) }));
        } catch (err) {
          toast.error(errorMessage(err, 'Could not update quest priority.'));
          throw err;
        }
      },
      bulkArchive: async (ids) => {
        try {
          const archivedAt = new Date().toISOString();
          await Promise.all(ids.map((id) => tasksApi.archive(id)));
          set((s) => {
            const idSet = new Set(ids);
            const nowArchived = s.tasks.filter((t) => idSet.has(t.id)).map((t) => ({ ...t, archivedAt }));
            return {
              tasks: s.tasks.filter((t) => !idSet.has(t.id)),
              archivedTasks: [...s.archivedTasks, ...nowArchived],
            };
          });
        } catch (err) {
          toast.error(errorMessage(err, 'Could not archive quests.'));
          throw err;
        }
      },
      bulkDelete: async (ids) => {
        try {
          await Promise.all(ids.map((id) => tasksApi.remove(id)));
          set((s) => ({ tasks: s.tasks.filter((t) => !ids.includes(t.id)) }));
        } catch (err) {
          toast.error(errorMessage(err, 'Could not delete quests.'));
          throw err;
        }
      },
      bulkAddTag: async (ids, tagId) => {
        const targets = get().tasks.filter((t) => ids.includes(t.id) && !t.tags?.some((tag) => tag.id === tagId));
        if (targets.length === 0) return;
        try {
          const [tag] = await Promise.all(targets.map((t) => taskTagsApi.add(t.id, tagId)));
          const targetIds = new Set(targets.map((t) => t.id));
          set((s) => ({
            tasks: s.tasks.map((t) => (targetIds.has(t.id) ? { ...t, tags: [...(t.tags ?? []), tag] } : t)),
          }));
        } catch (err) {
          toast.error(errorMessage(err, 'Could not tag quests.'));
          throw err;
        }
      },

      // The actions below (bulkAssign through bulkLinkTasks) are the newer half
      // of the bulk-action set. Unlike the ones above, they use
      // Promise.allSettled and never throw — a single failed request in a batch
      // of 20 shouldn't discard the 19 that succeeded, so each one applies
      // whatever did succeed and reports the outcome via bulkResultToast
      // instead of an all-or-nothing try/catch.
      bulkAssign: async (ids, userId) => {
        const targets = get().tasks.filter((t) => ids.includes(t.id) && !t.assignees?.some((a) => a.id === userId));
        if (targets.length === 0) return;
        const results = await Promise.allSettled(targets.map((t) => assigneesApi.add(t.id, userId)));
        const succeeded = results.filter((r) => r.status === 'fulfilled').length;
        // assigneesApi.add only returns the raw join row, not a fully-resolved
        // {id, name} assignee — refetch rather than reconstruct it locally.
        if (succeeded > 0) await get().refreshTasks();
        bulkResultToast('Assigned', succeeded, targets.length);
      },

      bulkSetStatus: async (ids, statusId) => {
        const beforeById = new Map(get().tasks.map((t) => [t.id, t]));
        const before = get().hunter;
        const results = await Promise.allSettled(ids.map((id) => tasksApi.setStatus(id, statusId)));
        const updated = results
          .filter((r): r is PromiseFulfilledResult<Task> => r.status === 'fulfilled')
          .map((r) => r.value);
        if (updated.length > 0) {
          const byId = new Map(updated.map((t) => [t.id, t]));
          set((s) => ({ tasks: s.tasks.map((t) => byId.get(t.id) ?? t) }));
          let xpDelta = 0;
          for (const t of updated) {
            const b = beforeById.get(t.id);
            if (b && b.done !== t.done) xpDelta += PRIORITY_XP[b.priority] * (t.done ? 1 : -1);
          }
          notifyXpGain(before, get().hunter, xpDelta);
        }
        bulkResultToast('Updated', updated.length, ids.length);
      },

      bulkSetDates: async (ids, patch) => {
        const results = await Promise.allSettled(ids.map((id) => tasksApi.update(id, patch)));
        const updated = results
          .filter((r): r is PromiseFulfilledResult<Task> => r.status === 'fulfilled')
          .map((r) => r.value);
        if (updated.length > 0) {
          const byId = new Map(updated.map((t) => [t.id, t]));
          set((s) => ({ tasks: s.tasks.map((t) => byId.get(t.id) ?? t) }));
        }
        bulkResultToast('Updated', updated.length, ids.length);
      },

      bulkMove: async (ids, listId) => {
        const results = await Promise.allSettled(ids.map((id) => tasksApi.move(id, listId)));
        const updated = results
          .filter((r): r is PromiseFulfilledResult<Task> => r.status === 'fulfilled')
          .map((r) => r.value);
        if (updated.length > 0) {
          const byId = new Map(updated.map((t) => [t.id, t]));
          set((s) => ({ tasks: s.tasks.map((t) => byId.get(t.id) ?? t) }));
        }
        bulkResultToast('Moved', updated.length, ids.length);
      },

      // "Add to a list" — clones each task (via the same endpoint the single-task
      // Duplicate button uses) and relocates the clone, leaving the originals
      // untouched in their current list.
      bulkCopyToList: async (ids, listId) => {
        const results = await Promise.allSettled(
          ids.map(async (id) => {
            const clone = await tasksApi.duplicate(id);
            return tasksApi.move(clone.id, listId);
          })
        );
        const created = results
          .filter((r): r is PromiseFulfilledResult<Task> => r.status === 'fulfilled')
          .map((r) => r.value);
        if (created.length > 0) set((s) => ({ tasks: [...s.tasks, ...created] }));
        bulkResultToast('Copied', created.length, ids.length);
      },

      bulkConvertToSubtask: async (ids, parentTaskId) => {
        const parent = get().tasks.find((t) => t.id === parentTaskId);
        const targets = ids.filter((id) => id !== parentTaskId);
        if (!parent || targets.length === 0) return;

        // Subtasks must live in the same list as their parent — the reorder
        // endpoint doesn't enforce this itself, but leaving them split across
        // lists would be a confusing state, so move anything that isn't
        // already there first.
        const needsMove = targets
          .map((id) => get().tasks.find((t) => t.id === id))
          .filter((t): t is Task => !!t && t.listId !== parent.listId);
        if (needsMove.length > 0) {
          const moveResults = await Promise.allSettled(needsMove.map((t) => tasksApi.move(t.id, parent.listId)));
          const moved = moveResults
            .filter((r): r is PromiseFulfilledResult<Task> => r.status === 'fulfilled')
            .map((r) => r.value);
          if (moved.length > 0) {
            const byId = new Map(moved.map((t) => [t.id, t]));
            set((s) => ({ tasks: s.tasks.map((t) => byId.get(t.id) ?? t) }));
          }
        }

        const siblingPositions = get()
          .tasks.filter((t) => t.parentTaskId === parentTaskId)
          .map((t) => t.position);
        let nextPosition = siblingPositions.length > 0 ? Math.max(...siblingPositions) + 1 : 0;
        const results = await Promise.allSettled(
          targets.map((id) => tasksApi.reorder(id, { parentTaskId, position: nextPosition++ }))
        );
        const updated = results
          .filter((r): r is PromiseFulfilledResult<Task> => r.status === 'fulfilled')
          .map((r) => r.value);
        if (updated.length > 0) {
          const byId = new Map(updated.map((t) => [t.id, t]));
          set((s) => ({ tasks: s.tasks.map((t) => byId.get(t.id) ?? t) }));
        }
        bulkResultToast('Converted', updated.length, targets.length);
      },

      bulkDuplicate: async (ids) => {
        const results = await Promise.allSettled(ids.map((id) => tasksApi.duplicate(id)));
        const created = results
          .filter((r): r is PromiseFulfilledResult<Task> => r.status === 'fulfilled')
          .map((r) => r.value);
        if (created.length > 0) set((s) => ({ tasks: [...s.tasks, ...created] }));
        bulkResultToast('Duplicated', created.length, ids.length);
      },

      // Links every selected task to one target task via the existing Related
      // Quests relation (with automatic backlinks — see relationsApi.create) —
      // doesn't touch anything in the list-view Task shape, so there's no local
      // `tasks` state to update, just the completion toast.
      bulkLinkTasks: async (ids, targetTaskId, type) => {
        const targets = ids.filter((id) => id !== targetTaskId);
        if (targets.length === 0) return;
        const results = await Promise.allSettled(targets.map((id) => relationsApi.create(id, targetTaskId, type)));
        const succeeded = results.filter((r) => r.status === 'fulfilled').length;
        bulkResultToast('Linked', succeeded, targets.length);
      },
    }),
    {
      name: 'solo-leveling-todo',
      // folders/projects/lists/tasks/workspaces are server-authoritative and normally
      // just reloaded via loadAll() on boot — but they're cached here too so the
      // mobile app has something to show on a cold start while offline. pendingOps and
      // lastSyncSignature are the offline mutation queue and its reconciliation
      // baseline (see offlineQueue.ts/reconcile.ts) and must survive an offline
      // force-quit/reopen just as much as the data itself.
      partialize: (s) => ({
        hunter: s.hunter,
        currentWorkspaceId: s.currentWorkspaceId,
        folders: s.folders,
        projects: s.projects,
        lists: s.lists,
        tasks: s.tasks,
        archivedTasks: s.archivedTasks,
        workspaces: s.workspaces,
        pendingOps: s.pendingOps,
        lastSyncSignature: s.lastSyncSignature,
        todayEntries: s.todayEntries,
      }),
    }
  )
);

// Keeps `hunter` derived from `tasks`/`archivedTasks` no matter which action
// path changed them — loadAll(), a sync reconciliation, an offline-queue
// replay, or any of the mutations above. Previously every mutation that could
// affect a task's done state had to remember to also recompute hunter by
// hand; anything that changed `tasks` without going through one of those
// specific call sites (most notably loadAll() picking up a completion made on
// another device) silently left it stale — which is what caused Level/XP to
// look wrong after syncing. A single always-on subscribe here means there's
// no longer a call site that can forget.
useStore.subscribe((state, prevState) => {
  if (state.tasks === prevState.tasks && state.archivedTasks === prevState.archivedTasks) return;
  const hunter = deriveHunterStats(state.tasks, state.archivedTasks, state.hunter.highestLevel);
  if (
    hunter.level !== state.hunter.level ||
    hunter.xp !== state.hunter.xp ||
    hunter.tasksCompleted !== state.hunter.tasksCompleted ||
    hunter.highestLevel !== state.hunter.highestLevel
  ) {
    useStore.setState({ hunter });
  }
});
