import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Folder, Project, TodoList, Task, Rank, Priority, Workspace, SyncStatus } from '../types';
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
 * Applies the XP/level/tasksCompleted delta for a task's done state flipping.
 * Shared by every path that can complete a task — the checkbox, the status
 * dropdown, and the Kanban board — so gamification stays consistent no matter
 * which surface someone uses to finish a quest.
 */
function applyDoneXpDelta(hunter: Hunter, priority: Priority, nowDone: boolean): Hunter {
  const delta = PRIORITY_XP[priority] * (nowDone ? 1 : -1);
  let xp = hunter.xp + delta;
  let level = hunter.level;
  let need = xpForLevel(level);

  while (xp >= need) {
    xp -= need;
    level += 1;
    need = xpForLevel(level);
  }
  while (xp < 0 && level > 1) {
    level -= 1;
    need = xpForLevel(level);
    xp += need;
  }
  if (xp < 0) xp = 0;

  const tasksCompleted = Math.max(0, hunter.tasksCompleted + (nowDone ? 1 : -1));
  // Badges earned at a past peak level stay earned even if XP is later reversed
  // (e.g. undoing a mistaken completion) — a reward system that could revoke
  // itself wouldn't feel like a reward.
  const highestLevel = Math.max(highestLevelOf(hunter), level);
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

interface StoreState {
  folders: Folder[];
  projects: Project[];
  lists: TodoList[];
  tasks: Task[];
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

  loadAll: () => Promise<void>;
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
}

const emptyHunter: Hunter = { level: 1, xp: 0, tasksCompleted: 0, highestLevel: 1 };

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      folders: [],
      projects: [],
      lists: [],
      tasks: [],
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

      loadAll: async () => {
        if (get().loading) return;
        set({ loading: true });
        try {
          const [folders, projects, lists, tasks, workspaces] = await Promise.all([
            foldersApi.list(),
            projectsApi.list(),
            listsApi.listAll(),
            tasksApi.listAll(true),
            workspacesApi.list(),
          ]);
          const persistedId = get().currentWorkspaceId;
          const currentWorkspaceId = workspaces.some((w) => w.id === persistedId)
            ? persistedId
            : (workspaces[0]?.id ?? null);
          set({ folders, projects, lists, tasks, workspaces, currentWorkspaceId, loaded: true, loading: false });
        } catch (err) {
          set({ loading: false });
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
          workspaces: [],
          loaded: false,
          hunter: emptyHunter,
          pendingOps: [],
          lastSyncSignature: null,
          lastResolvedTempId: null,
          syncState: 'idle',
          lastSyncedAt: null,
          syncConflict: null,
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
        const queueOffline = () => {
          const before = get().hunter;
          const hunter = applyDoneXpDelta(before, task.priority, nowDone);
          set((s) => ({
            tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: nowDone, updatedAt: new Date().toISOString() } : t)),
            hunter,
            pendingOps: appendOp(s.pendingOps, {
              id: crypto.randomUUID(),
              kind: 'toggleDone',
              taskId: id,
              done: nowDone,
              createdAt: Date.now(),
            }),
          }));
          notifyXpGain(before, hunter, PRIORITY_XP[task.priority] * (nowDone ? 1 : -1));
        };
        if (!navigator.onLine) {
          queueOffline();
          return;
        }
        try {
          const updated = await tasksApi.update(id, { done: nowDone });
          const before = get().hunter;
          const hunter = applyDoneXpDelta(before, task.priority, nowDone);
          set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)), hunter }));
          notifyXpGain(before, hunter, PRIORITY_XP[task.priority] * (nowDone ? 1 : -1));
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
          const updated = await tasksApi.setStatus(id, statusId);
          set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
          if (beforeTask && beforeTask.done !== updated.done) {
            const beforeHunter = get().hunter;
            const hunter = applyDoneXpDelta(beforeHunter, beforeTask.priority, updated.done);
            set({ hunter });
            notifyXpGain(beforeHunter, hunter, PRIORITY_XP[beforeTask.priority] * (updated.done ? 1 : -1));
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
        const tasks = await tasksApi.listAll(true);
        set({ tasks });
      },

      // Bulk actions reuse the single-task endpoints in parallel — task lists in this
      // app are small enough that N requests is simpler and safer than adding a
      // dedicated batch API, and per-task permission checks stay intact for free.
      bulkSetDone: async (ids, done) => {
        const targets = get().tasks.filter((t) => ids.includes(t.id) && t.done !== done);
        if (targets.length === 0) return;
        try {
          const updated = await Promise.all(targets.map((t) => tasksApi.update(t.id, { done })));
          const byId = new Map(updated.map((u) => [u.id, u]));
          const beforeHunter = get().hunter;
          let hunter = beforeHunter;
          for (const t of targets) hunter = applyDoneXpDelta(hunter, t.priority, done);
          set((s) => ({ tasks: s.tasks.map((t) => byId.get(t.id) ?? t), hunter }));
          const xpDelta = targets.reduce((sum, t) => sum + PRIORITY_XP[t.priority] * (done ? 1 : -1), 0);
          notifyXpGain(beforeHunter, hunter, xpDelta);
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
          await Promise.all(ids.map((id) => tasksApi.archive(id)));
          set((s) => ({ tasks: s.tasks.filter((t) => !ids.includes(t.id)) }));
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
        workspaces: s.workspaces,
        pendingOps: s.pendingOps,
        lastSyncSignature: s.lastSyncSignature,
      }),
    }
  )
);
