import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateTaskFromTemplateModal } from './CreateTaskFromTemplateModal';
import { useStore } from '../store/useStore';
import { taskTemplatesApi } from '../api/services';
import type { TaskTemplate } from '../types';

vi.mock('../api/services', () => ({
  taskTemplatesApi: { list: vi.fn() },
}));

function template(overrides: Partial<TaskTemplate>): TaskTemplate {
  return {
    id: 'tt1',
    userId: 'u1',
    name: 'Scouting Checklist',
    title: 'Scout the gate',
    description: null,
    priority: 'medium',
    subtasks: [],
    createdAt: '',
    ...overrides,
  };
}

describe('CreateTaskFromTemplateModal', () => {
  it('shows an empty state when there are no saved templates', async () => {
    vi.mocked(taskTemplatesApi.list).mockResolvedValue([]);
    render(<CreateTaskFromTemplateModal listId="l1" onClose={vi.fn()} />);

    expect(await screen.findByText(/No saved templates yet/)).toBeInTheDocument();
  });

  it('creates a task from the selected template in the given list', async () => {
    vi.mocked(taskTemplatesApi.list).mockResolvedValue([template({})]);
    const createTaskFromTemplate = vi.fn().mockResolvedValue('task-new');
    useStore.setState({ createTaskFromTemplate });
    const onClose = vi.fn();

    render(<CreateTaskFromTemplateModal listId="l1" onClose={onClose} />);

    expect(await screen.findByText('Scouting Checklist')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Create Quest'));

    await waitFor(() => expect(createTaskFromTemplate).toHaveBeenCalledWith('tt1', 'l1'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
