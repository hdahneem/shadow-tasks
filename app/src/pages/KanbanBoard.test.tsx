import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { KanbanBoard } from './KanbanBoard';
import { useStore } from '../store/useStore';
import { statusesApi, tasksApi } from '../api/services';
import type { Status, Task } from '../types';

vi.mock('../api/services', () => ({
  statusesApi: { listForProject: vi.fn() },
  tasksApi: { listForProject: vi.fn(), setStatus: vi.fn() },
}));

const project = {
  id: 'p1',
  workspaceId: 'w1',
  folderId: null,
  name: 'Clear the Red Gate',
  rank: 'E' as const,
  createdAt: '',
  effectiveRole: 'admin' as const,
};

const statuses: Status[] = [
  { id: 's1', projectId: 'p1', name: 'To Do', color: '#7c93b3', position: 1, isCompleted: false, createdAt: '' },
  { id: 's2', projectId: 'p1', name: 'Done', color: '#4ade80', position: 2, isCompleted: true, createdAt: '' },
];

function baseTask(overrides: Partial<Task>): Task {
  return {
    id: 't1',
    listId: 'l1',
    parentTaskId: null,
    title: 'Untitled',
    priority: 'medium',
    done: false,
    position: 0,
    createdAt: '',
    updatedAt: '',
    progress: 0,
    ...overrides,
  };
}

function renderBoard() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1/board']}>
      <Routes>
        <Route path="/projects/:projectId/board" element={<KanbanBoard />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('KanbanBoard', () => {
  beforeEach(() => {
    useStore.setState({ projects: [project] });
    vi.mocked(statusesApi.listForProject).mockResolvedValue(statuses);
  });

  it('groups tasks into their matching status column', async () => {
    vi.mocked(tasksApi.listForProject).mockResolvedValue([
      baseTask({ id: 't1', title: 'Scout the entrance', statusId: 's1' }),
      baseTask({ id: 't2', title: 'Slay the ice elves', statusId: 's2', done: true }),
    ]);

    renderBoard();

    await waitFor(() => expect(screen.getByText('Scout the entrance')).toBeInTheDocument());
    expect(screen.getByText('Slay the ice elves')).toBeInTheDocument();
    expect(screen.getByText('To Do')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('puts a task with no matching status in an Unsorted column', async () => {
    vi.mocked(tasksApi.listForProject).mockResolvedValue([
      baseTask({ id: 't3', title: 'Orphaned quest', statusId: null }),
    ]);

    renderBoard();

    await waitFor(() => expect(screen.getByText('Orphaned quest')).toBeInTheDocument());
    expect(screen.getByText('Unsorted')).toBeInTheDocument();
  });

  it('shows an empty-state message for a column with no tasks', async () => {
    vi.mocked(tasksApi.listForProject).mockResolvedValue([]);

    renderBoard();

    await waitFor(() => expect(screen.getAllByText('No quests here.')).toHaveLength(2));
  });
});
