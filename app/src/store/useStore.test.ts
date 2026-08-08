import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { xpForLevel, rankForLevel } from './useStore';

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
  },
}));

describe('xpForLevel', () => {
  it('increases with level', () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(2)).toBeGreaterThan(xpForLevel(1));
    expect(xpForLevel(10)).toBeGreaterThan(xpForLevel(5));
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

describe('toggleTask XP logic', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('awards XP on completion and levels up once the threshold is crossed, then reverses cleanly on un-complete', async () => {
    const { tasksApi } = await import('../api/services');
    const { useStore } = await import('./useStore');

    const baseTask = {
      id: 't1',
      listId: 'l1',
      parentTaskId: null,
      title: 'Grind the dungeon',
      priority: 'high' as const,
      done: false,
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 0,
    };

    useStore.setState({
      tasks: [baseTask],
      hunter: { level: 1, xp: 90, tasksCompleted: 0, highestLevel: 1 },
    });

    vi.mocked(tasksApi.update).mockResolvedValue({ ...baseTask, done: true });

    // high priority = 35 XP; 90 + 35 = 125, crosses the level-1 threshold (100) -> level 2, 25 XP remaining
    await useStore.getState().toggleTask('t1');

    expect(useStore.getState().hunter.level).toBe(2);
    expect(useStore.getState().hunter.xp).toBe(25);
    expect(useStore.getState().hunter.tasksCompleted).toBe(1);
    expect(useStore.getState().tasks[0].done).toBe(true);

    // un-completing should reverse the level-up exactly
    vi.mocked(tasksApi.update).mockResolvedValue({ ...baseTask, done: false });
    await useStore.getState().toggleTask('t1');

    expect(useStore.getState().hunter.level).toBe(1);
    expect(useStore.getState().hunter.xp).toBe(90);
    expect(useStore.getState().hunter.tasksCompleted).toBe(0);
    // reversing the level-up doesn't erase the peak once reached — badges earned stay earned
    expect(useStore.getState().hunter.highestLevel).toBe(2);
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
