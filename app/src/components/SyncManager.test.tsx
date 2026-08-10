import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SyncManager } from './SyncManager';
import { useAuthStore } from '../store/useAuthStore';
import { useStore } from '../store/useStore';
import { tasksApi, foldersApi, projectsApi, listsApi, workspacesApi } from '../api/services';
import type { PendingOp } from '../store/offlineQueue';

vi.mock('../api/services', () => ({
  tasksApi: { syncStatus: vi.fn(), update: vi.fn(), create: vi.fn(), remove: vi.fn(), listAll: vi.fn() },
  foldersApi: { list: vi.fn() },
  projectsApi: { list: vi.fn() },
  listsApi: { listAll: vi.fn() },
  workspacesApi: { list: vi.fn() },
}));

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

const pendingOp: PendingOp = { id: 'op1', kind: 'toggleDone', taskId: 't1', done: true, createdAt: 1000 };

describe('SyncManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setOnline(true);
    useAuthStore.setState({ status: 'unauthenticated', user: null });
    useStore.setState({
      pendingOps: [],
      lastSyncSignature: null,
      tasks: [],
      loaded: true,
      loading: false,
      syncState: 'idle',
      syncConflict: null,
    });
    vi.mocked(foldersApi.list).mockResolvedValue([]);
    vi.mocked(projectsApi.list).mockResolvedValue([]);
    vi.mocked(listsApi.listAll).mockResolvedValue([]);
    vi.mocked(workspacesApi.list).mockResolvedValue([]);
    vi.mocked(tasksApi.listAll).mockResolvedValue([]);
    vi.mocked(tasksApi.update).mockResolvedValue({
      id: 't1',
      listId: 'l1',
      parentTaskId: null,
      title: 'Clear the gate',
      priority: 'medium',
      done: true,
      position: 0,
      createdAt: '',
      updatedAt: '',
      progress: 0,
    });
  });

  it('renders nothing when not authenticated', () => {
    vi.mocked(tasksApi.syncStatus).mockResolvedValue({ lastModifiedAt: null, count: 0 });
    const { container } = render(<SyncManager />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when authenticated with nothing to reconcile', async () => {
    vi.mocked(tasksApi.syncStatus).mockResolvedValue({ lastModifiedAt: null, count: 0 });
    useAuthStore.setState({ status: 'authenticated', user: { id: 'u1', email: 'a@b.com', name: 'A' } });

    const { container } = render(<SyncManager />);

    await waitFor(() => expect(tasksApi.syncStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('does nothing beyond a silent refresh when there are no pending ops', async () => {
    vi.mocked(tasksApi.syncStatus).mockResolvedValue({ lastModifiedAt: '2026-08-07T00:00:00.000Z', count: 2 });
    useAuthStore.setState({ status: 'authenticated', user: { id: 'u1', email: 'a@b.com', name: 'A' } });

    render(<SyncManager />);

    await waitFor(() => expect(tasksApi.syncStatus).toHaveBeenCalled());
    expect(screen.queryByText('Sync Conflict')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(useStore.getState().lastSyncSignature).toEqual({
        lastModifiedAt: '2026-08-07T00:00:00.000Z',
        count: 2,
      })
    );
  });

  it('shows the conflict modal when pending ops exist and the server signature has moved', async () => {
    vi.mocked(tasksApi.syncStatus).mockResolvedValue({ lastModifiedAt: '2026-08-07T02:00:00.000Z', count: 5 });
    useAuthStore.setState({ status: 'authenticated', user: { id: 'u1', email: 'a@b.com', name: 'A' } });
    useStore.setState({
      pendingOps: [pendingOp],
      lastSyncSignature: { lastModifiedAt: '2026-08-07T00:00:00.000Z', count: 4 },
    });

    render(<SyncManager />);

    expect(await screen.findByText('Sync Conflict')).toBeInTheDocument();
  });

  it('auto-replays without a prompt when the server signature has not moved since last sync', async () => {
    vi.mocked(tasksApi.syncStatus).mockResolvedValue({ lastModifiedAt: '2026-08-07T00:00:00.000Z', count: 4 });
    useAuthStore.setState({ status: 'authenticated', user: { id: 'u1', email: 'a@b.com', name: 'A' } });
    useStore.setState({
      pendingOps: [pendingOp],
      lastSyncSignature: { lastModifiedAt: '2026-08-07T00:00:00.000Z', count: 4 },
    });

    render(<SyncManager />);

    await waitFor(() => expect(useStore.getState().pendingOps).toHaveLength(0));
    expect(screen.queryByText('Sync Conflict')).not.toBeInTheDocument();
  });

  it('marks the sync as failed (surfaced by SyncStatusIndicator) when the reconciliation check fails', async () => {
    vi.mocked(tasksApi.syncStatus).mockRejectedValue(new Error('network down'));
    useAuthStore.setState({ status: 'authenticated', user: { id: 'u1', email: 'a@b.com', name: 'A' } });

    render(<SyncManager />);

    await waitFor(() => expect(useStore.getState().syncState).toBe('error'));
  });
});
