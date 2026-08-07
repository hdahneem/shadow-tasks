import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TimelineView } from './TimelineView';
import { useStore } from '../store/useStore';
import { tasksApi } from '../api/services';
import type { Task, TodoList } from '../types';

vi.mock('../api/services', () => ({
  tasksApi: { listForProject: vi.fn() },
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

const lists: TodoList[] = [{ id: 'l1', projectId: 'p1', name: 'Preparation', createdAt: '' }];

function task(overrides: Partial<Task>): Task {
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

function renderTimeline() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1/timeline']}>
      <Routes>
        <Route path="/projects/:projectId/timeline" element={<TimelineView />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TimelineView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ projects: [project], lists });
  });

  it('renders a bar row for each scheduled task, grouped under its list', async () => {
    vi.mocked(tasksApi.listForProject).mockResolvedValue([
      task({ id: 't1', title: 'Scout the gate', startDate: '2026-08-05T00:00:00.000Z', dueDate: '2026-08-07T00:00:00.000Z' }),
    ]);
    renderTimeline();

    expect(await screen.findByText('Scout the gate')).toBeInTheDocument();
    expect(screen.getByText('Preparation')).toBeInTheDocument();
  });

  it('lists tasks with no start or due date under Unscheduled instead of on the grid', async () => {
    vi.mocked(tasksApi.listForProject).mockResolvedValue([
      task({ id: 't1', title: 'No dates yet', startDate: null, dueDate: null }),
    ]);
    renderTimeline();

    await waitFor(() => expect(screen.getByText('Unscheduled')).toBeInTheDocument());
    expect(screen.getByText('No dates yet')).toBeInTheDocument();
    expect(screen.queryByText('Preparation')).not.toBeInTheDocument();
  });

  it('omits the Unscheduled section entirely when every task has a date', async () => {
    vi.mocked(tasksApi.listForProject).mockResolvedValue([
      task({ id: 't1', title: 'Dated', dueDate: '2026-08-05T00:00:00.000Z' }),
    ]);
    renderTimeline();

    await screen.findByText('Dated');
    expect(screen.queryByText('Unscheduled')).not.toBeInTheDocument();
  });

  it('navigates to the task detail page when a task title is clicked', async () => {
    vi.mocked(tasksApi.listForProject).mockResolvedValue([
      task({ id: 't1', title: 'Scout the gate', dueDate: '2026-08-05T00:00:00.000Z' }),
    ]);
    render(
      <MemoryRouter initialEntries={['/projects/p1/timeline']}>
        <Routes>
          <Route path="/projects/:projectId/timeline" element={<TimelineView />} />
          <Route path="/tasks/:taskId" element={<div>Task Detail Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByText('Scout the gate'));
    expect(await screen.findByText('Task Detail Page')).toBeInTheDocument();
  });

  it('shows a not-found message for an unknown project', () => {
    useStore.setState({ projects: [] });
    renderTimeline();
    expect(screen.getByText('Project not found.')).toBeInTheDocument();
  });
});
