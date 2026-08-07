import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TaskRow } from './TaskRow';
import { useStore } from '../store/useStore';
import type { Tag, Task } from '../types';

function tag(id: string, name: string, color = '#22d3ee'): Tag {
  return { id, workspaceId: 'w1', name, color, createdAt: '' };
}

function baseTask(overrides: Partial<Task>): Task {
  return {
    id: 't1',
    listId: 'l1',
    parentTaskId: null,
    title: 'Clear the gate',
    priority: 'medium',
    done: false,
    position: 0,
    createdAt: '',
    updatedAt: '',
    progress: 0,
    ...overrides,
  };
}

function renderRow(task: Task) {
  return render(
    <MemoryRouter>
      <TaskRow task={task} />
    </MemoryRouter>
  );
}

describe('TaskRow tag pills', () => {
  beforeEach(() => {
    useStore.setState({ toggleTask: vi.fn().mockResolvedValue(undefined), deleteTask: vi.fn().mockResolvedValue(undefined) });
  });

  it('renders no tag pills when the task has none', () => {
    renderRow(baseTask({ tags: [] }));
    expect(screen.queryByText('Urgent')).not.toBeInTheDocument();
  });

  it('renders up to two tag pills by name', () => {
    renderRow(baseTask({ tags: [tag('t1', 'Urgent'), tag('t2', 'Bug')] }));
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.getByText('Bug')).toBeInTheDocument();
  });

  it('collapses extra tags into a "+N" indicator beyond the first two', () => {
    renderRow(baseTask({ tags: [tag('t1', 'Urgent'), tag('t2', 'Bug'), tag('t3', 'Epic')] }));
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.getByText('Bug')).toBeInTheDocument();
    expect(screen.queryByText('Epic')).not.toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });
});
