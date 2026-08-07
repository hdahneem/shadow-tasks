import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RelatedTasksPanel } from './RelatedTasksPanel';
import { useStore } from '../store/useStore';
import { relationsApi } from '../api/services';
import { ApiError } from '../api/client';
import type { Task, TaskRelation } from '../types';

vi.mock('../api/services', () => ({
  relationsApi: { create: vi.fn(), remove: vi.fn() },
}));

function baseTask(overrides: Partial<Task>): Task {
  return {
    id: 't-main',
    listId: 'l1',
    parentTaskId: null,
    title: 'Fix login flow',
    priority: 'high',
    done: false,
    position: 0,
    createdAt: '',
    updatedAt: '',
    progress: 0,
    projectId: 'p1',
    relatedTasks: [],
    ...overrides,
  };
}

function rel(overrides: Partial<TaskRelation>): TaskRelation {
  return {
    id: 'r1',
    type: 'related',
    task: { id: 't-other', title: 'Bug report', done: false, priority: 'medium' },
    ...overrides,
  };
}

function renderPanel(task: Task, onChanged = vi.fn()) {
  return render(
    <MemoryRouter>
      <RelatedTasksPanel task={task} onChanged={onChanged} />
    </MemoryRouter>
  );
}

describe('RelatedTasksPanel', () => {
  beforeEach(() => {
    useStore.setState({
      tasks: [
        baseTask({ id: 't-main' }),
        {
          ...baseTask({ id: 't-candidate', title: 'Bug report' }),
          list: { id: 'l1', name: 'Main', project: { id: 'p1', name: 'Gate Raid' } },
        },
        {
          ...baseTask({ id: 't-other-project', title: 'Unrelated quest' }),
          list: { id: 'l2', name: 'Other', project: { id: 'p2', name: 'Other Project' } },
        },
      ],
    });
  });

  it('shows an empty state when there are no related quests', () => {
    renderPanel(baseTask({}));
    expect(screen.getByText('No related quests yet.')).toBeInTheDocument();
  });

  it('renders related quests with their type label', () => {
    renderPanel(baseTask({ relatedTasks: [rel({ type: 'bug' })] }));
    expect(screen.getByText('Bug report')).toBeInTheDocument();
    expect(screen.getByText('Bug')).toBeInTheDocument();
  });

  it('only offers same-project tasks as link candidates, excluding self and already-linked tasks', () => {
    renderPanel(baseTask({}));
    fireEvent.click(screen.getByText('+ Link Quest'));

    expect(screen.getByText('Bug report')).toBeInTheDocument();
    expect(screen.queryByText('Unrelated quest')).not.toBeInTheDocument();
    expect(screen.queryByText('Fix login flow')).not.toBeInTheDocument();
  });

  it('creates a relation and reports the change', async () => {
    vi.mocked(relationsApi.create).mockResolvedValue(rel({}));
    const onChanged = vi.fn();
    renderPanel(baseTask({}), onChanged);

    fireEvent.click(screen.getByText('+ Link Quest'));
    fireEvent.change(screen.getByText('Select a quest…').closest('select')!, {
      target: { value: 't-candidate' },
    });
    fireEvent.click(screen.getByText('Link Quest'));

    await waitFor(() => expect(relationsApi.create).toHaveBeenCalledWith('t-main', 't-candidate', 'related'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('shows an error when linking fails', async () => {
    vi.mocked(relationsApi.create).mockRejectedValue(new ApiError(409, 'These quests are already linked'));
    renderPanel(baseTask({}));

    fireEvent.click(screen.getByText('+ Link Quest'));
    fireEvent.change(screen.getByText('Select a quest…').closest('select')!, {
      target: { value: 't-candidate' },
    });
    fireEvent.click(screen.getByText('Link Quest'));

    expect(await screen.findByText('These quests are already linked')).toBeInTheDocument();
  });

  it('removes a relation', async () => {
    vi.mocked(relationsApi.remove).mockResolvedValue(undefined);
    const onChanged = vi.fn();
    renderPanel(baseTask({ relatedTasks: [rel({ id: 'r1' })] }), onChanged);

    fireEvent.click(screen.getByText('✕'));

    await waitFor(() => expect(relationsApi.remove).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
