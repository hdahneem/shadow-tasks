import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DependenciesPanel } from './DependenciesPanel';
import { useStore } from '../store/useStore';
import { dependenciesApi } from '../api/services';
import { ApiError } from '../api/client';
import type { Task, TaskDependency } from '../types';

vi.mock('../api/services', () => ({
  dependenciesApi: { create: vi.fn(), remove: vi.fn() },
}));

function baseTask(overrides: Partial<Task>): Task {
  return {
    id: 't-main',
    listId: 'l1',
    parentTaskId: null,
    title: 'Slay the ice elves',
    priority: 'high',
    done: false,
    position: 0,
    createdAt: '',
    updatedAt: '',
    progress: 0,
    projectId: 'p1',
    dependsOn: [],
    blocks: [],
    ...overrides,
  };
}

function dep(overrides: Partial<TaskDependency>): TaskDependency {
  return {
    id: 'd1',
    type: 'finish_to_start',
    task: { id: 't-other', title: 'Scout the entrance', done: false, priority: 'medium' },
    ...overrides,
  };
}

function renderPanel(task: Task, onChanged = vi.fn()) {
  return render(
    <MemoryRouter>
      <DependenciesPanel task={task} onChanged={onChanged} />
    </MemoryRouter>
  );
}

describe('DependenciesPanel', () => {
  beforeEach(() => {
    useStore.setState({
      tasks: [
        baseTask({ id: 't-main' }),
        {
          ...baseTask({ id: 't-candidate', title: 'Scout the entrance' }),
          list: { id: 'l1', name: 'Main', project: { id: 'p1', name: 'Gate Raid' } },
        },
        {
          ...baseTask({ id: 't-other-project', title: 'Unrelated quest' }),
          list: { id: 'l2', name: 'Other', project: { id: 'p2', name: 'Other Project' } },
        },
      ],
    });
  });

  it('shows an empty state when there are no dependencies', () => {
    renderPanel(baseTask({}));
    expect(screen.getByText("This quest isn't waiting on anything.")).toBeInTheDocument();
    expect(screen.queryByText(/Blocking/)).not.toBeInTheDocument();
  });

  it('renders waiting-on and blocking dependency lists', () => {
    renderPanel(
      baseTask({
        dependsOn: [dep({ id: 'd1', task: { id: 'a', title: 'Scout the entrance', done: false, priority: 'medium' } })],
        blocks: [dep({ id: 'd2', task: { id: 'b', title: 'Report back', done: true, priority: 'low' } })],
      })
    );
    expect(screen.getByText('Waiting On (1)')).toBeInTheDocument();
    expect(screen.getByText('Scout the entrance')).toBeInTheDocument();
    expect(screen.getByText('Blocking (1)')).toBeInTheDocument();
    expect(screen.getByText('Report back')).toBeInTheDocument();
    expect(screen.getAllByText('Finish → Start')).toHaveLength(2);
  });

  it('only offers same-project tasks as dependency candidates, excluding self and existing dependencies', () => {
    renderPanel(baseTask({}));
    fireEvent.click(screen.getByText('+ Add Dependency'));

    expect(screen.getByText('Scout the entrance')).toBeInTheDocument();
    expect(screen.queryByText('Unrelated quest')).not.toBeInTheDocument();
    expect(screen.queryByText('Slay the ice elves')).not.toBeInTheDocument();
  });

  it('creates a dependency and reports the change', async () => {
    vi.mocked(dependenciesApi.create).mockResolvedValue(dep({}));
    const onChanged = vi.fn();
    renderPanel(baseTask({}), onChanged);

    fireEvent.click(screen.getByText('+ Add Dependency'));
    fireEvent.change(screen.getByText('Select a quest…').closest('select')!, {
      target: { value: 't-candidate' },
    });
    fireEvent.click(screen.getByText('Add Dependency'));

    await waitFor(() =>
      expect(dependenciesApi.create).toHaveBeenCalledWith('t-main', 't-candidate', 'finish_to_start')
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('shows an error when creating a dependency fails (e.g. a cycle)', async () => {
    vi.mocked(dependenciesApi.create).mockRejectedValue(new ApiError(400, 'This would create a dependency cycle'));
    renderPanel(baseTask({}));

    fireEvent.click(screen.getByText('+ Add Dependency'));
    fireEvent.change(screen.getByText('Select a quest…').closest('select')!, {
      target: { value: 't-candidate' },
    });
    fireEvent.click(screen.getByText('Add Dependency'));

    expect(await screen.findByText('This would create a dependency cycle')).toBeInTheDocument();
  });

  it('removes a dependency', async () => {
    vi.mocked(dependenciesApi.remove).mockResolvedValue(undefined);
    const onChanged = vi.fn();
    renderPanel(
      baseTask({ dependsOn: [dep({ id: 'd1' })] }),
      onChanged
    );

    fireEvent.click(screen.getByText('✕'));

    await waitFor(() => expect(dependenciesApi.remove).toHaveBeenCalledWith('d1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
