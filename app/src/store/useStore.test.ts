import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { xpForLevel, rankForLevel } from './useStore';
import type { Task } from '../types';

vi.mock('../api/services', () => ({
  foldersApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  projectsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  listsApi: { listAll: vi.fn(), listForProject: vi.fn(), create: vi.fn(), rename: vi.fn(), remove: vi.fn() },
  tasksApi: {
    listAll: vi.fn(),
    listForList: vi.fn(),
    listForProject: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    setStatus: vi.fn(),
    reorder: vi.fn(),
    syncStatus: vi.fn(),
    move: vi.fn(),
    duplicate: vi.fn(),
  },
  workspacesApi: { list: vi.fn() },
  todayApi: { list: vi.fn(), setStatus: vi.fn() },
  assigneesApi: { add: vi.fn(), remove: vi.fn() },
  relationsApi: { create: vi.fn(), remove: vi.fn() },
}));

describe('xpForLevel', () => {
  it('increases with level', () => {
    expect(xpForLevel(1)).toBe(90);
    expect(xpForLevel(2)).toBeGreaterThan(xpForLevel(1));
    expect(xpForLevel(10)).toBeGreaterThan(xpForLevel(5));
  });

  it('grows superlinearly, so each level costs progressively more than the last', () => {
    const step10 = xpForLevel(10) - xpForLevel(9);
    const step50 = xpForLevel(50) - xpForLevel(49);
    const step99 = xpForLevel(99) - xpForLevel(98);
    expect(step50).toBeGreaterThan(step10);
    expect(step99).toBeGreaterThan(step50);
  });
});

describe('rankForLevel', () => {
  it('maps level ranges to the correct rank', () => {
    expect(rankForLevel(1)).toBe('E');
    expect(rankForLevel(9)).toBe('E');
    expect(rankForLevel(10)).toBe('D');
    expect(rankForLevel(19)).toBe('D');
    expect(rankForLevel(20)).toBe('C');
    expect(rankForLevel(30)).toBe('B');
    expect(rankForLevel(40)).toBe('A');
    expect(rankForLevel(50)).toBe('S');
    expect(rankForLevel(100)).toBe('S');
  });
});

// Hunter stats are now fully derived from completed-task priorities (see
// deriveHunterStats in useStore.ts) rather than an independently-settable
// counter, so these tests can no longer seed an arbitrary starting `hunter`
// disconnected from `tasks` — the store-wide subscribe would immediately
// recompute it from whatever's actually in `tasks` anyway. Instead, a desired
// starting XP total is built out of already-completed filler quests.
function doneFiller(id: string, priority: 'low' | 'medium' | 'high' = 'medium'): Task {
  return {
    id,
    listId: 'l1',
    parentTaskId: null,
    title: 'Warm-up quest',
    priority,
    done: true,
    position: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    progress: 100,
  };
}

// Mirrors the leveling loop in deriveHunterStats, so tests can work out — from
// the real xpForLevel curve — how many 35-XP filler completions land a hunter
// at a given level, without hardcoding numbers that only happened to match an
// old, independently-tracked XP counter.
function levelForTotalXp(totalXp: number): { level: number; xp: number } {
  let level = 1;
  let xp = totalXp;
  let need = xpForLevel(level);
  while (xp >= need) {
    xp -= need;
    level += 1;
    need = xpForLevel(level);
  }
  return { level, xp };
}

describe('toggleTask XP logic', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('awards XP on completion and levels up once the threshold is crossed, then reverses cleanly on un-complete', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');

    const baseTask: Task = {
      id: 't1',
      listId: 'l1',
      parentTaskId: null,
      title: 'Grind the dungeon',
      priority: 'high',
      done: false,
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 0,
    };

    // 3 already-completed medium-priority quests = 60 XP baseline (3 × 20), level 1
    useStore.setState({ tasks: [baseTask, doneFiller('f1'), doneFiller('f2'), doneFiller('f3')] });

    vi.mocked(tasksApi.update).mockResolvedValue({ ...baseTask, done: true });

    // high priority = 35 XP; 60 + 35 = 95, crosses the level-1 threshold (90) -> level 2, 5 XP remaining
    await useStore.getState().toggleTask('t1');

    expect(useStore.getState().hunter.level).toBe(2);
    expect(useStore.getState().hunter.xp).toBe(5);
    expect(useStore.getState().hunter.tasksCompleted).toBe(4); // 3 filler + this one
    expect(useStore.getState().tasks.find((t) => t.id === 't1')?.done).toBe(true);

    // un-completing should reverse the level-up exactly
    vi.mocked(tasksApi.update).mockResolvedValue({ ...baseTask, done: false });
    await useStore.getState().toggleTask('t1');

    expect(useStore.getState().hunter.level).toBe(1);
    expect(useStore.getState().hunter.xp).toBe(60);
    expect(useStore.getState().hunter.tasksCompleted).toBe(3);
    // reversing the level-up doesn't erase the peak once reached — badges earned stay earned
    expect(useStore.getState().hunter.highestLevel).toBe(2);
  });

  it('announces the XP gain and level-up, but stays silent on reversal', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    const { useToastStore } = await import('./useToastStore');

    const baseTask: Task = {
      id: 't1',
      listId: 'l1',
      parentTaskId: null,
      title: 'Grind the dungeon',
      priority: 'high',
      done: false,
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 0,
    };
    // 3 already-completed medium-priority quests = 60 XP baseline (3 × 20), level 1
    useStore.setState({ tasks: [baseTask, doneFiller('f1'), doneFiller('f2'), doneFiller('f3')] });
    useToastStore.setState({ toasts: [] });

    vi.mocked(tasksApi.update).mockResolvedValue({ ...baseTask, done: true });
    await useStore.getState().toggleTask('t1');

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('success');
    expect(toasts[0].message).toBe('+35 XP — Level Up! Now Level 2 (E-Rank)');

    // un-completing reverses the XP but shouldn't announce anything
    vi.mocked(tasksApi.update).mockResolvedValue({ ...baseTask, done: false });
    await useStore.getState().toggleTask('t1');

    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('announces a badge unlock instead of a plain level-up when a badge threshold is crossed', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    const { useToastStore } = await import('./useToastStore');

    const baseTask: Task = {
      id: 't1',
      listId: 'l1',
      parentTaskId: null,
      title: 'Clear the D-Rank gate',
      priority: 'high',
      done: false,
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 0,
    };

    // Find how many 35-XP filler completions land exactly at level 9 (one
    // below D-Rank's level-10 badge), so completing baseTask is the one
    // completion that crosses the threshold.
    let fillerCount = 1;
    while (
      !(
        levelForTotalXp(fillerCount * 35).level === 9 &&
        levelForTotalXp((fillerCount + 1) * 35).level === 10
      )
    ) {
      fillerCount++;
    }
    const fillers = Array.from({ length: fillerCount }, (_, i) => doneFiller(`f${i}`, 'high'));
    useStore.setState({ tasks: [baseTask, ...fillers] });
    useToastStore.setState({ toasts: [] });

    vi.mocked(tasksApi.update).mockResolvedValue({ ...baseTask, done: true });
    await useStore.getState().toggleTask('t1');

    expect(useStore.getState().hunter.level).toBe(10);
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('+35 XP — Badge Unlocked: D-Rank Vanguard!');
  });

  it('never drops tasksCompleted below zero', async () => {
    const { useStore } = await import('./useStore');
    const { tasksApi } = await import('../api/services');

    const task = {
      id: 't2',
      listId: 'l1',
      parentTaskId: null,
      title: 'Already done',
      priority: 'low' as const,
      done: true,
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 100,
    };
    useStore.setState({ tasks: [task], hunter: { level: 1, xp: 0, tasksCompleted: 0, highestLevel: 1 } });
    vi.mocked(tasksApi.update).mockResolvedValue({ ...task, done: false });

    await useStore.getState().toggleTask('t2');
    expect(useStore.getState().hunter.tasksCompleted).toBe(0);
  });
});

describe('setTaskStatus XP sync', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('awards XP when a status move lands on a completed status, matching the checkbox behavior', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');

    const task = {
      id: 't3',
      listId: 'l1',
      parentTaskId: null,
      title: 'Clear the gate',
      priority: 'medium' as const,
      done: false,
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 0,
    };
    useStore.setState({ tasks: [task], hunter: { level: 1, xp: 0, tasksCompleted: 0, highestLevel: 1 } });
    vi.mocked(tasksApi.setStatus).mockResolvedValue({ ...task, done: true, statusId: 's-done' });

    await useStore.getState().setTaskStatus('t3', 's-done');

    expect(useStore.getState().hunter.xp).toBe(20); // medium priority
    expect(useStore.getState().hunter.tasksCompleted).toBe(1);
    expect(useStore.getState().tasks[0].statusId).toBe('s-done');
  });

  it('does not double-award XP when moving between two non-completed statuses', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');

    const task = {
      id: 't4',
      listId: 'l1',
      parentTaskId: null,
      title: 'Scout ahead',
      priority: 'high' as const,
      done: false,
      statusId: 's-todo',
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 0,
    };
    useStore.setState({ tasks: [task], hunter: { level: 1, xp: 0, tasksCompleted: 0, highestLevel: 1 } });
    vi.mocked(tasksApi.setStatus).mockResolvedValue({ ...task, done: false, statusId: 's-in-progress' });

    await useStore.getState().setTaskStatus('t4', 's-in-progress');

    expect(useStore.getState().hunter.xp).toBe(0);
    expect(useStore.getState().hunter.tasksCompleted).toBe(0);
  });

  it('skips the XP delta gracefully when the task is not in the global cache (e.g. a subtask)', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');

    useStore.setState({ tasks: [], hunter: { level: 1, xp: 0, tasksCompleted: 0, highestLevel: 1 } });
    vi.mocked(tasksApi.setStatus).mockResolvedValue({
      id: 'sub-1',
      listId: 'l1',
      parentTaskId: 't3',
      title: 'Subtask',
      priority: 'high',
      done: true,
      statusId: 's-done',
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 0,
    });

    await expect(useStore.getState().setTaskStatus('sub-1', 's-done')).resolves.toBeTruthy();
    expect(useStore.getState().hunter.xp).toBe(0);
  });
});

describe('reorderTask', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('optimistically applies the new position, then reconciles with the server response', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');

    const task = {
      id: 't1',
      listId: 'l1',
      parentTaskId: null,
      title: 'Scout the gate',
      priority: 'medium' as const,
      done: false,
      position: 1,
      createdAt: '',
      updatedAt: '',
      progress: 0,
    };
    useStore.setState({ tasks: [task] });

    let resolveReorder: (value: typeof task) => void;
    vi.mocked(tasksApi.reorder).mockReturnValue(
      new Promise((resolve) => {
        resolveReorder = resolve;
      })
    );

    const promise = useStore.getState().reorderTask('t1', 2.5);

    // optimistic update happens synchronously, before the API call resolves
    expect(useStore.getState().tasks[0].position).toBe(2.5);

    resolveReorder!({ ...task, position: 2.5, updatedAt: 'server-updated' });
    await promise;

    expect(tasksApi.reorder).toHaveBeenCalledWith('t1', { position: 2.5 });
    expect(useStore.getState().tasks[0].updatedAt).toBe('server-updated');
  });
});

describe('failed mutations surface an error toast', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('toggleTask pushes an error toast and rethrows when the request fails', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    const { useToastStore } = await import('./useToastStore');
    const { ApiError } = await import('../api/client');

    const task = {
      id: 't1',
      listId: 'l1',
      parentTaskId: null,
      title: 'Clear the gate',
      priority: 'medium' as const,
      done: false,
      position: 0,
      createdAt: '',
      updatedAt: '',
      progress: 0,
    };
    useStore.setState({ tasks: [task], hunter: { level: 1, xp: 0, tasksCompleted: 0, highestLevel: 1 } });
    vi.mocked(tasksApi.update).mockRejectedValue(new ApiError(500, 'Server exploded'));

    await expect(useStore.getState().toggleTask('t1')).rejects.toThrow('Server exploded');

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('error');
    expect(toasts[0].message).toBe('Server exploded');
    // the failed mutation must not have been applied optimistically
    expect(useStore.getState().tasks[0].done).toBe(false);
  });

  it('deleteTask pushes an error toast and leaves the task in place when the request fails', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    const { useToastStore } = await import('./useToastStore');
    const { ApiError } = await import('../api/client');

    const task = {
      id: 't1',
      listId: 'l1',
      parentTaskId: null,
      title: 'Clear the gate',
      priority: 'medium' as const,
      done: false,
      position: 0,
      createdAt: '',
      updatedAt: '',
      progress: 0,
    };
    useStore.setState({ tasks: [task] });
    vi.mocked(tasksApi.remove).mockRejectedValue(new ApiError(403, 'Not allowed'));

    await expect(useStore.getState().deleteTask('t1')).rejects.toThrow('Not allowed');

    expect(useToastStore.getState().toasts[0].message).toBe('Not allowed');
    expect(useStore.getState().tasks).toHaveLength(1);
  });

  it('queues the op offline instead of throwing when the failure is not an ApiError', async () => {
    // navigator.onLine is unreliable on some WebViews (observed on a real device:
    // it stays true even with the radios fully off), so a raw fetch failure here
    // is treated as "actually offline" and queued for replay rather than surfaced
    // as a dead-end error.
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    const { useToastStore } = await import('./useToastStore');

    const task = {
      id: 't1',
      listId: 'l1',
      parentTaskId: null,
      title: 'Clear the gate',
      priority: 'medium' as const,
      done: false,
      position: 0,
      createdAt: '',
      updatedAt: '',
      progress: 0,
    };
    useStore.setState({ tasks: [task] });
    vi.mocked(tasksApi.remove).mockRejectedValue(new Error('network down'));

    await expect(useStore.getState().deleteTask('t1')).resolves.toBeUndefined();

    expect(useToastStore.getState().toasts).toHaveLength(0);
    expect(useStore.getState().tasks).toHaveLength(0);
    expect(useStore.getState().pendingOps).toEqual([
      expect.objectContaining({ kind: 'delete', taskId: 't1' }),
    ]);
  });
});

describe('createTask', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('creates the task via the API, appends it to tasks, and returns it', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');

    const created = {
      id: 't1',
      listId: 'l1',
      parentTaskId: 'q1',
      title: 'Check gate stability',
      priority: 'medium' as const,
      done: false,
      position: 0,
      createdAt: '',
      updatedAt: '',
      progress: 0,
    };
    vi.mocked(tasksApi.create).mockResolvedValue(created);

    const result = await useStore.getState().createTask('l1', {
      title: 'Check gate stability',
      priority: 'medium',
      parentTaskId: 'q1',
    });

    expect(tasksApi.create).toHaveBeenCalledWith('l1', {
      title: 'Check gate stability',
      priority: 'medium',
      parentTaskId: 'q1',
    });
    expect(result).toEqual(created);
    expect(useStore.getState().tasks).toContainEqual(created);
  });

  it('propagates a thrown error without touching the offline queue', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    const { ApiError } = await import('../api/client');

    useStore.setState({ pendingOps: [], tasks: [] });
    vi.mocked(tasksApi.create).mockRejectedValue(new ApiError(400, 'Title required'));

    await expect(useStore.getState().createTask('l1', { title: '' })).rejects.toThrow('Title required');
    expect(useStore.getState().pendingOps).toEqual([]);
    expect(useStore.getState().tasks).toEqual([]);
  });
});

describe('loadTodayEntries', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('fetches today\'s entries and keys them by taskId', async () => {
    const { todayApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    vi.mocked(todayApi.list).mockResolvedValue({
      date: '2026-08-12',
      entries: [
        { taskId: 'a', status: 'added' },
        { taskId: 'b', status: 'dismissed' },
      ],
    });

    await useStore.getState().loadTodayEntries();

    expect(useStore.getState().todayEntries).toEqual({ a: 'added', b: 'dismissed' });
  });
});

describe('setTodayEntry', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('optimistically records the entry, then persists it via the API', async () => {
    const { todayApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    useStore.setState({ todayEntries: {} });
    vi.mocked(todayApi.setStatus).mockResolvedValue({ taskId: 't1', status: 'added' });

    await useStore.getState().setTodayEntry('t1', 'added');

    expect(todayApi.setStatus).toHaveBeenCalledWith('t1', 'added');
    expect(useStore.getState().todayEntries).toEqual({ t1: 'added' });
  });

  it('overwrites a prior entry for the same task (e.g. accepting a suggestion then dismissing it)', async () => {
    const { todayApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    useStore.setState({ todayEntries: { t1: 'added' } });
    vi.mocked(todayApi.setStatus).mockResolvedValue({ taskId: 't1', status: 'dismissed' });

    await useStore.getState().setTodayEntry('t1', 'dismissed');

    expect(useStore.getState().todayEntries).toEqual({ t1: 'dismissed' });
  });

  it('reverts the optimistic update and surfaces a toast when the request fails', async () => {
    const { todayApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    const { useToastStore } = await import('./useToastStore');
    useStore.setState({ todayEntries: { t1: 'added' } });
    vi.mocked(todayApi.setStatus).mockRejectedValue(new Error('network down'));

    await expect(useStore.getState().setTodayEntry('t1', 'dismissed')).rejects.toThrow('network down');

    expect(useStore.getState().todayEntries).toEqual({ t1: 'added' });
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('error');
  });

  it('reverts to no entry at all (not a stale value) when there was nothing to roll back to', async () => {
    const { todayApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    useStore.setState({ todayEntries: {} });
    vi.mocked(todayApi.setStatus).mockRejectedValue(new Error('network down'));

    await expect(useStore.getState().setTodayEntry('t1', 'added')).rejects.toThrow();

    expect(useStore.getState().todayEntries).toEqual({});
  });
});

describe('offline mutations', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });
  afterEach(() => {
    // restore regardless of how the test exits, so a thrown assertion never
    // leaves navigator.onLine stubbed false for whatever test file runs next
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  function stubOffline() {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  }
  function stubOnline() {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  }

  it('addTask queues a create op and shows an optimistic temp task, without calling the API', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');

    stubOffline();
    useStore.setState({ tasks: [], pendingOps: [] });

    await useStore.getState().addTask('l1', 'Buy milk', 'medium', undefined, undefined);

    expect(tasksApi.create).not.toHaveBeenCalled();
    const { tasks, pendingOps } = useStore.getState();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toMatch(/^temp-/);
    expect(tasks[0].title).toBe('Buy milk');
    expect(pendingOps).toHaveLength(1);
    expect(pendingOps[0]).toMatchObject({ kind: 'create', tempId: tasks[0].id, listId: 'l1' });

    stubOnline();
  });

  it('addTask calls the API and does not queue anything when online (regression)', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');

    stubOnline();
    useStore.setState({ tasks: [], pendingOps: [] });
    const created = {
      id: 'real-1',
      listId: 'l1',
      parentTaskId: null,
      title: 'Buy milk',
      priority: 'medium' as const,
      done: false,
      position: 0,
      createdAt: '',
      updatedAt: '',
      progress: 0,
    };
    vi.mocked(tasksApi.create).mockResolvedValue(created);

    await useStore.getState().addTask('l1', 'Buy milk', 'medium', undefined, undefined);

    expect(tasksApi.create).toHaveBeenCalledWith('l1', {
      title: 'Buy milk',
      priority: 'medium',
      dueDate: undefined,
      description: undefined,
    });
    const { tasks, pendingOps } = useStore.getState();
    expect(tasks).toEqual([created]);
    expect(pendingOps).toHaveLength(0);
  });

  it('toggleTask queues a toggleDone op and applies the change optimistically while offline', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');

    stubOffline();
    const task = {
      id: 't1',
      listId: 'l1',
      parentTaskId: null,
      title: 'Clear the gate',
      priority: 'medium' as const,
      done: false,
      position: 0,
      createdAt: '',
      updatedAt: '',
      progress: 0,
    };
    useStore.setState({ tasks: [task], pendingOps: [], hunter: { level: 1, xp: 0, tasksCompleted: 0, highestLevel: 1 } });

    await useStore.getState().toggleTask('t1');

    expect(tasksApi.update).not.toHaveBeenCalled();
    expect(useStore.getState().tasks[0].done).toBe(true);
    expect(useStore.getState().pendingOps).toEqual([
      expect.objectContaining({ kind: 'toggleDone', taskId: 't1', done: true }),
    ]);

    stubOnline();
  });

  it('updateTask and deleteTask queue their ops while offline instead of calling the API', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');

    stubOffline();
    const task = {
      id: 't1',
      listId: 'l1',
      parentTaskId: null,
      title: 'Clear the gate',
      priority: 'medium' as const,
      done: false,
      position: 0,
      createdAt: '',
      updatedAt: '',
      progress: 0,
    };
    useStore.setState({ tasks: [task], pendingOps: [] });

    await useStore.getState().updateTask('t1', { title: 'Renamed' });
    expect(useStore.getState().tasks[0].title).toBe('Renamed');

    await useStore.getState().deleteTask('t1');
    expect(useStore.getState().tasks).toHaveLength(0);

    expect(tasksApi.update).not.toHaveBeenCalled();
    expect(tasksApi.remove).not.toHaveBeenCalled();
    // the update op should have been dropped when the delete came in, per the
    // offlineQueue collapse rules, leaving just the delete queued.
    expect(useStore.getState().pendingOps).toEqual([expect.objectContaining({ kind: 'delete', taskId: 't1' })]);

    stubOnline();
  });

  it('replayPendingOps replays the queue against the real API and clears it', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');

    stubOnline();
    const created = {
      id: 'real-2',
      listId: 'l1',
      parentTaskId: null,
      title: 'Synced quest',
      priority: 'medium' as const,
      done: false,
      position: 0,
      createdAt: '',
      updatedAt: '',
      progress: 0,
    };
    vi.mocked(tasksApi.create).mockResolvedValue(created);

    useStore.setState({
      tasks: [{ ...created, id: 'temp-1', title: 'Synced quest' }],
      pendingOps: [
        { id: 'op1', kind: 'create', tempId: 'temp-1', listId: 'l1', payload: { title: 'Synced quest' }, createdAt: 1 },
      ],
    });

    await useStore.getState().replayPendingOps();

    expect(tasksApi.create).toHaveBeenCalledWith('l1', { title: 'Synced quest' });
    expect(useStore.getState().pendingOps).toHaveLength(0);
    expect(useStore.getState().tasks.find((t) => t.id === 'real-2')).toBeTruthy();
    expect(useStore.getState().tasks.find((t) => t.id === 'temp-1')).toBeUndefined();
  });
});

describe('triggerSync', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('does nothing when not authenticated', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    const { useAuthStore } = await import('./useAuthStore');
    useAuthStore.setState({ status: 'unauthenticated' });

    await useStore.getState().triggerSync(true);

    expect(tasksApi.syncStatus).not.toHaveBeenCalled();
  });

  it('does nothing while offline', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    const { useAuthStore } = await import('./useAuthStore');
    useAuthStore.setState({ status: 'authenticated' });
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    await useStore.getState().triggerSync(true);

    expect(tasksApi.syncStatus).not.toHaveBeenCalled();
  });

  it('never rejects, and marks syncState as error, when the sync-status check fails', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    const { useAuthStore } = await import('./useAuthStore');
    useAuthStore.setState({ status: 'authenticated' });
    vi.mocked(tasksApi.syncStatus).mockRejectedValue(new Error('offline'));

    await expect(useStore.getState().triggerSync(true)).resolves.toBeUndefined();

    expect(useStore.getState().syncState).toBe('error');
  });

  it('sets syncState to idle and records when it finished, on a clean silent-refresh', async () => {
    const { tasksApi, foldersApi, projectsApi, listsApi, workspacesApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    const { useAuthStore } = await import('./useAuthStore');
    useAuthStore.setState({ status: 'authenticated' });
    useStore.setState({ pendingOps: [], lastSyncSignature: null });
    vi.mocked(tasksApi.syncStatus).mockResolvedValue({ lastModifiedAt: '2026-08-10T00:00:00.000Z', count: 1 });
    vi.mocked(foldersApi.list).mockResolvedValue([]);
    vi.mocked(projectsApi.list).mockResolvedValue([]);
    vi.mocked(listsApi.listAll).mockResolvedValue([]);
    vi.mocked(workspacesApi.list).mockResolvedValue([]);
    vi.mocked(tasksApi.listAll).mockResolvedValue([]);
    const { todayApi } = await import('../api/services');
    vi.mocked(todayApi.list).mockResolvedValue({ date: '2026-08-10', entries: [] });

    await useStore.getState().triggerSync(true);

    expect(useStore.getState().syncState).toBe('idle');
    expect(useStore.getState().lastSyncedAt).not.toBeNull();
    expect(useStore.getState().lastSyncSignature).toEqual({ lastModifiedAt: '2026-08-10T00:00:00.000Z', count: 1 });
  });

  it('throttles unforced calls, but a forced call always goes through', async () => {
    const { tasksApi, foldersApi, projectsApi, listsApi, workspacesApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    const { useAuthStore } = await import('./useAuthStore');
    useAuthStore.setState({ status: 'authenticated' });
    useStore.setState({ pendingOps: [], lastSyncSignature: null });
    // vi.mock's factory only runs once per file, so these mocks (and their call
    // history) persist across tests/resetModules — clear the count explicitly
    // rather than relying on toHaveBeenCalledWith like the other tests here do.
    vi.mocked(tasksApi.syncStatus).mockClear();
    vi.mocked(tasksApi.syncStatus).mockResolvedValue({ lastModifiedAt: null, count: 0 });
    vi.mocked(foldersApi.list).mockResolvedValue([]);
    vi.mocked(projectsApi.list).mockResolvedValue([]);
    vi.mocked(listsApi.listAll).mockResolvedValue([]);
    vi.mocked(workspacesApi.list).mockResolvedValue([]);
    vi.mocked(tasksApi.listAll).mockResolvedValue([]);
    const { todayApi } = await import('../api/services');
    vi.mocked(todayApi.list).mockResolvedValue({ date: '2026-08-10', entries: [] });

    await useStore.getState().triggerSync(true);
    expect(tasksApi.syncStatus).toHaveBeenCalledTimes(1);

    await useStore.getState().triggerSync(); // unforced, well within the throttle window
    expect(tasksApi.syncStatus).toHaveBeenCalledTimes(1);

    await useStore.getState().triggerSync(true); // forced bypasses the throttle
    expect(tasksApi.syncStatus).toHaveBeenCalledTimes(2);
  });
});

describe('dismissSyncConflict', () => {
  it('clears the conflict without touching anything else', async () => {
    const { useStore } = await import('./useStore');
    useStore.setState({ syncConflict: { localChangedAt: 1, serverChangedAt: null }, syncState: 'idle' });

    useStore.getState().dismissSyncConflict();

    expect(useStore.getState().syncConflict).toBeNull();
    expect(useStore.getState().syncState).toBe('idle');
  });
});

function bulkTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    listId: 'l1',
    parentTaskId: null,
    title: 'Untitled quest',
    priority: 'medium',
    done: false,
    position: 0,
    createdAt: '',
    updatedAt: '',
    progress: 0,
    ...overrides,
  };
}

describe('bulkAssign', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('assigns and refetches on success', async () => {
    const { assigneesApi, tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    const { useToastStore } = await import('./useToastStore');
    useStore.setState({ tasks: [bulkTask({ id: 'a' }), bulkTask({ id: 'b' })] });
    vi.mocked(assigneesApi.add).mockResolvedValue({ id: 'u1', name: 'Sung Jin-Woo' });
    vi.mocked(tasksApi.listAll).mockResolvedValue([bulkTask({ id: 'a', assignees: [{ id: 'u1', name: 'Sung Jin-Woo' }] })]);

    await useStore.getState().bulkAssign(['a', 'b'], 'u1');

    expect(assigneesApi.add).toHaveBeenCalledWith('a', 'u1');
    expect(assigneesApi.add).toHaveBeenCalledWith('b', 'u1');
    expect(tasksApi.listAll).toHaveBeenCalled(); // refetch, since assign responses aren't full tasks
    const toasts = useToastStore.getState().toasts;
    expect(toasts[toasts.length - 1]).toMatchObject({ type: 'success', message: 'Assigned 2 quests.' });
  });

  it('skips tasks already assigned to that hunter', async () => {
    const { assigneesApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    useStore.setState({ tasks: [bulkTask({ id: 'a', assignees: [{ id: 'u1', name: 'Sung Jin-Woo' }] })] });

    await useStore.getState().bulkAssign(['a'], 'u1');

    expect(assigneesApi.add).not.toHaveBeenCalled();
  });

  it('reports a partial failure without discarding the successes', async () => {
    const { assigneesApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    const { useToastStore } = await import('./useToastStore');
    useStore.setState({ tasks: [bulkTask({ id: 'a' }), bulkTask({ id: 'b' })] });
    vi.mocked(assigneesApi.add)
      .mockResolvedValueOnce({ id: 'u1', name: 'Sung Jin-Woo' })
      .mockRejectedValueOnce(new Error('nope'));

    await useStore.getState().bulkAssign(['a', 'b'], 'u1');

    const toasts = useToastStore.getState().toasts;
    expect(toasts[toasts.length - 1]).toMatchObject({ type: 'error', message: 'Assigned 1 of 2 quests — 1 failed.' });
  });
});

describe('bulkSetStatus', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('updates tasks and applies the XP delta when a status flips done', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    useStore.setState({
      tasks: [bulkTask({ id: 'a', priority: 'high', done: false })],
      hunter: { level: 1, xp: 0, tasksCompleted: 0, highestLevel: 1 },
    });
    vi.mocked(tasksApi.setStatus).mockResolvedValue(bulkTask({ id: 'a', priority: 'high', done: true, statusId: 's1' }));

    await useStore.getState().bulkSetStatus(['a'], 's1');

    expect(useStore.getState().tasks[0].statusId).toBe('s1');
    expect(useStore.getState().hunter.xp).toBe(35); // high priority XP
    expect(useStore.getState().hunter.tasksCompleted).toBe(1);
  });

  it('reports a partial failure', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    const { useToastStore } = await import('./useToastStore');
    useStore.setState({ tasks: [bulkTask({ id: 'a' }), bulkTask({ id: 'b' })] });
    vi.mocked(tasksApi.setStatus)
      .mockResolvedValueOnce(bulkTask({ id: 'a', statusId: 's1' }))
      .mockRejectedValueOnce(new Error('nope'));

    await useStore.getState().bulkSetStatus(['a', 'b'], 's1');

    const toasts = useToastStore.getState().toasts;
    expect(toasts[toasts.length - 1]).toMatchObject({ type: 'error', message: 'Updated 1 of 2 quests — 1 failed.' });
  });
});

describe('bulkSetDates', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('applies the same date patch to every task', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    useStore.setState({ tasks: [bulkTask({ id: 'a' }), bulkTask({ id: 'b' })] });
    vi.mocked(tasksApi.update).mockImplementation(async (id, patch) => bulkTask({ id, ...patch }));

    await useStore.getState().bulkSetDates(['a', 'b'], { dueDate: '2026-09-01T00:00:00.000Z' });

    expect(tasksApi.update).toHaveBeenCalledWith('a', { dueDate: '2026-09-01T00:00:00.000Z' });
    expect(tasksApi.update).toHaveBeenCalledWith('b', { dueDate: '2026-09-01T00:00:00.000Z' });
    expect(useStore.getState().tasks.map((t) => t.dueDate)).toEqual([
      '2026-09-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
    ]);
  });
});

describe('bulkMove', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('moves every task to the target list', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    useStore.setState({ tasks: [bulkTask({ id: 'a', listId: 'l1' })] });
    vi.mocked(tasksApi.move).mockResolvedValue(bulkTask({ id: 'a', listId: 'l2' }));

    await useStore.getState().bulkMove(['a'], 'l2');

    expect(tasksApi.move).toHaveBeenCalledWith('a', 'l2');
    expect(useStore.getState().tasks[0].listId).toBe('l2');
  });
});

describe('bulkCopyToList', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('duplicates then relocates the clone, leaving the original untouched', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    useStore.setState({ tasks: [bulkTask({ id: 'a', listId: 'l1', title: 'Original' })] });
    vi.mocked(tasksApi.duplicate).mockResolvedValue(bulkTask({ id: 'a-copy', listId: 'l1', title: 'Original (copy)' }));
    vi.mocked(tasksApi.move).mockResolvedValue(bulkTask({ id: 'a-copy', listId: 'l2', title: 'Original (copy)' }));

    await useStore.getState().bulkCopyToList(['a'], 'l2');

    expect(tasksApi.duplicate).toHaveBeenCalledWith('a');
    expect(tasksApi.move).toHaveBeenCalledWith('a-copy', 'l2');
    const ids = useStore.getState().tasks.map((t) => t.id);
    expect(ids).toEqual(['a', 'a-copy']); // original still present, clone appended
    expect(useStore.getState().tasks.find((t) => t.id === 'a')?.listId).toBe('l1');
    expect(useStore.getState().tasks.find((t) => t.id === 'a-copy')?.listId).toBe('l2');
  });
});

describe('bulkConvertToSubtask', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('reparents same-list tasks without moving them first', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    useStore.setState({
      tasks: [bulkTask({ id: 'parent', listId: 'l1' }), bulkTask({ id: 'child', listId: 'l1' })],
    });
    vi.mocked(tasksApi.reorder).mockResolvedValue(bulkTask({ id: 'child', listId: 'l1', parentTaskId: 'parent', position: 0 }));

    await useStore.getState().bulkConvertToSubtask(['child'], 'parent');

    expect(tasksApi.move).not.toHaveBeenCalled();
    expect(tasksApi.reorder).toHaveBeenCalledWith('child', { parentTaskId: 'parent', position: 0 });
    expect(useStore.getState().tasks.find((t) => t.id === 'child')?.parentTaskId).toBe('parent');
  });

  it('moves a cross-list task into the parent\'s list before reparenting it', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    useStore.setState({
      tasks: [bulkTask({ id: 'parent', listId: 'l1' }), bulkTask({ id: 'child', listId: 'l2' })],
    });
    vi.mocked(tasksApi.move).mockResolvedValue(bulkTask({ id: 'child', listId: 'l1' }));
    vi.mocked(tasksApi.reorder).mockResolvedValue(bulkTask({ id: 'child', listId: 'l1', parentTaskId: 'parent', position: 0 }));

    await useStore.getState().bulkConvertToSubtask(['child'], 'parent');

    expect(tasksApi.move).toHaveBeenCalledWith('child', 'l1');
    expect(tasksApi.reorder).toHaveBeenCalledWith('child', { parentTaskId: 'parent', position: 0 });
  });

  it('excludes the parent itself from the target list, even if it was selected', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    useStore.setState({ tasks: [bulkTask({ id: 'parent', listId: 'l1' })] });

    await useStore.getState().bulkConvertToSubtask(['parent'], 'parent');

    expect(tasksApi.reorder).not.toHaveBeenCalled();
  });
});

describe('bulkDuplicate', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('appends a clone of each task without touching the originals', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    useStore.setState({ tasks: [bulkTask({ id: 'a', title: 'Original' })] });
    vi.mocked(tasksApi.duplicate).mockResolvedValue(bulkTask({ id: 'a-copy', title: 'Original (copy)' }));

    await useStore.getState().bulkDuplicate(['a']);

    expect(useStore.getState().tasks.map((t) => t.id)).toEqual(['a', 'a-copy']);
  });
});

describe('bulkLinkTasks', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('links every selected task to the target', async () => {
    const { relationsApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    const { useToastStore } = await import('./useToastStore');
    useStore.setState({ tasks: [bulkTask({ id: 'a' }), bulkTask({ id: 'b' }), bulkTask({ id: 'target' })] });
    vi.mocked(relationsApi.create).mockResolvedValue({
      id: 'r1',
      type: 'related',
      task: { id: 'target', title: 'Target', done: false, priority: 'medium' },
    });

    await useStore.getState().bulkLinkTasks(['a', 'b'], 'target', 'related');

    expect(relationsApi.create).toHaveBeenCalledWith('a', 'target', 'related');
    expect(relationsApi.create).toHaveBeenCalledWith('b', 'target', 'related');
    const toasts = useToastStore.getState().toasts;
    expect(toasts[toasts.length - 1]).toMatchObject({ type: 'success', message: 'Linked 2 quests.' });
  });

  it('excludes the target task from its own link list', async () => {
    const { relationsApi } = await import('../api/services');
    const { useStore } = await import('./useStore');
    useStore.setState({ tasks: [bulkTask({ id: 'target' })] });

    await useStore.getState().bulkLinkTasks(['target'], 'target', 'related');

    expect(relationsApi.create).not.toHaveBeenCalled();
  });
});
