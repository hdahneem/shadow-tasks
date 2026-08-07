import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ActivityFeedView } from './ActivityFeedView';
import { useStore } from '../store/useStore';
import { workspacesApi } from '../api/services';
import type { WorkspaceActivityEntry } from '../types';

vi.mock('../api/services', () => ({
  workspacesApi: { activity: vi.fn() },
}));

function entry(overrides: Partial<WorkspaceActivityEntry>): WorkspaceActivityEntry {
  return {
    id: 'e1',
    type: 'task_created',
    payload: null,
    createdAt: '2026-08-05T00:00:00.000Z',
    actorName: 'Lim Tae-Gyu',
    taskId: 't1',
    taskTitle: 'Clear the gate',
    ...overrides,
  };
}

function renderView() {
  return render(
    <MemoryRouter>
      <ActivityFeedView />
    </MemoryRouter>
  );
}

describe('ActivityFeedView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ currentWorkspaceId: 'w1' });
  });

  it('shows an empty state when there is no activity', async () => {
    vi.mocked(workspacesApi.activity).mockResolvedValue([]);
    renderView();
    expect(await screen.findByText('Nothing has happened yet.')).toBeInTheDocument();
    expect(workspacesApi.activity).toHaveBeenCalledWith('w1', 50, 0);
  });

  it('renders an entry with its description, task link, and timestamp', async () => {
    vi.mocked(workspacesApi.activity).mockResolvedValue([entry({})]);
    renderView();

    expect(await screen.findByText('Lim Tae-Gyu created this quest')).toBeInTheDocument();
    expect(screen.getByText('Clear the gate')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clear the gate' })).toHaveAttribute('href', '/tasks/t1');
  });

  it('shows "Load more" only when a full page comes back, and hides it otherwise', async () => {
    vi.mocked(workspacesApi.activity).mockResolvedValue([entry({})]);
    renderView();
    await screen.findByText('Lim Tae-Gyu created this quest');
    expect(screen.queryByText('Load more')).not.toBeInTheDocument();
  });

  it('loads the next page and appends entries', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => entry({ id: `p1-${i}`, taskTitle: `Quest ${i}` }));
    const page2 = [entry({ id: 'p2-0', taskTitle: 'Older quest' })];
    vi.mocked(workspacesApi.activity).mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);
    renderView();

    await screen.findByText('Quest 0');
    expect(screen.getByText('Load more')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Load more'));

    await waitFor(() => expect(workspacesApi.activity).toHaveBeenCalledWith('w1', 50, 50));
    expect(await screen.findByText('Older quest')).toBeInTheDocument();
    expect(screen.queryByText('Load more')).not.toBeInTheDocument();
  });
});
