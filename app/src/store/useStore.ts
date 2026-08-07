import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Folder, Project, TodoList, Task, Rank, Priority, Workspace } from '../types';
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
} from '../api/services';
import { errorMessage } from '../api/client';
import { toast } from './useToastStore';

export function xpForLevel(level: number): number {
  return Math.round(100 + (level - 1) * 55);
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

  loadAll: () => Promise<void>;
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

      reset: () =>
        set({ folders: [], projects: [], lists: [], tasks: [], workspaces: [], loaded: false, hunter: emptyHunter }),

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
        const task = await tasksApi.create(listId, {
          title,
          priority,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          description: notes,
        });
        set((s) => ({ tasks: [...s.tasks, task] }));
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
        try {
          const updated = await tasksApi.update(id, { done: nowDone });
          const hunter = applyDoneXpDelta(get().hunter, task.priority, nowDone);
          set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)), hunter }));
        } catch (err) {
          toast.error(errorMessage(err, 'Could not update quest.'));
          throw err;
        }
      },

      // Used by the status dropdown and the Kanban board — any path that can move
      // a task onto/off a "counts as done" status grants/reverses XP the same way
      // the checkbox does, keyed off the task's *previous* known done state.
      setTaskStatus: async (id, statusId) => {
        const before = get().tasks.find((t) => t.id === id);
        try {
          const updated = await tasksApi.setStatus(id, statusId);
          set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
          if (before && before.done !== updated.done) {
            const hunter = applyDoneXpDelta(get().hunter, before.priority, updated.done);
            set({ hunter });
          }
          return updated;
        } catch (err) {
          toast.error(errorMessage(err, 'Could not update quest status.'));
          throw err;
        }
      },

      updateTask: async (id, patch) => {
        try {
          const updated = await tasksApi.update(id, patch);
          set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
        } catch (err) {
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
        try {
          await tasksApi.remove(id);
          set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
        } catch (err) {
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
          let hunter = get().hunter;
          for (const t of targets) hunter = applyDoneXpDelta(hunter, t.priority, done);
          set((s) => ({ tasks: s.tasks.map((t) => byId.get(t.id) ?? t), hunter }));
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
      // only the client-only gamification layer and the last-active workspace choice are
      // worth persisting locally; folders/projects/lists/tasks/workspaces are
      // server-authoritative and reloaded via loadAll().
      partialize: (s) => ({ hunter: s.hunter, currentWorkspaceId: s.currentWorkspaceId }),
    }
  )
);
