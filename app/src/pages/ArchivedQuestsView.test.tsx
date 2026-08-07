import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ArchivedQuestsView } from './ArchivedQuestsView';
import { tasksApi } from '../api/services';
import type { PaginatedTasks, Task } from '../types';

vi.mock('../api/services', () => ({
  tasksApi: { listAllPaged: vi.fn(), restore: vi.fn(), remove: vi.fn() },
}));

function task(overrides: Partial<Task>): Task {
  return {
    id: 't1',
    listId: 'l1',
    parentTaskId: null,
    title: 'Old quest',
    priority: 'medium',
    done: false,
    position: 0,
    createdAt: '',
    updatedAt: '',
    progress: 0,
    archivedAt: '2026-08-01T00:00:00.000Z',
    list: { id: 'l1', name: 'Preparation', project: { id: 'p1', name: 'Clear the Red Gate' } },
    ...overrides,
  };
}

function page(tasks: Task[], total = tasks.length, pageNum = 1): PaginatedTasks {
  return { tasks, total, page: pageNum, pageSize: 25 };
}

function renderView() {
  return render(
    <MemoryRouter>
      <ArchivedQuestsView />
    </MemoryRouter>
  );
}

describe('ArchivedQuestsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an empty state when there are no archived quests', async () => {
    vi.mocked(tasksApi.listAllPaged).mockResolvedValue(page([]));
    renderView();
    expect(await screen.findByText('No archived quests.')).toBeInTheDocument();
    expect(tasksApi.listAllPaged).toHaveBeenCalledWith({ archived: true, includeDone: true, page: 1, pageSize: 25 });
  });

  it('renders archived quests with their project/list breadcrumb', async () => {
    vi.mocked(tasksApi.listAllPaged).mockResolvedValue(page([task({})]));
    renderView();
    expect(await screen.findByText('Old quest')).toBeInTheDocument();
    expect(screen.getByText('Clear the Red Gate / Preparation')).toBeInTheDocument();
  });

  it('restores a task and refetches the list from page 1', async () => {
    vi.mocked(tasksApi.listAllPaged).mockResolvedValue(page([task({})]));
    vi.mocked(tasksApi.restore).mockResolvedValue(task({}));
    renderView();

    fireEvent.click(await screen.findByText('Restore'));

    await waitFor(() => expect(tasksApi.restore).toHaveBeenCalledWith('t1'));
    await waitFor(() => expect(tasksApi.listAllPaged).toHaveBeenCalledTimes(2));
    expect(tasksApi.listAllPaged).toHaveBeenLastCalledWith({
      archived: true,
      includeDone: true,
      page: 1,
      pageSize: 25,
    });
  });

  it('deletes a task permanently after confirming', async () => {
    vi.mocked(tasksApi.listAllPaged).mockResolvedValue(page([task({})]));
    vi.mocked(tasksApi.remove).mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderView();

    fireEvent.click(await screen.findByText('Delete'));

    await waitFor(() => expect(tasksApi.remove).toHaveBeenCalledWith('t1'));
  });

  it('does not delete when the confirmation is cancelled', async () => {
    vi.mocked(tasksApi.listAllPaged).mockResolvedValue(page([task({})]));
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderView();

    fireEvent.click(await screen.findByText('Delete'));

    expect(tasksApi.remove).not.toHaveBeenCalled();
  });

  it('shows a Load More button when more archived quests exist, and appends the next page', async () => {
    vi.mocked(tasksApi.listAllPaged)
      .mockResolvedValueOnce(page([task({ id: 't1', title: 'First quest' })], 2, 1))
      .mockResolvedValueOnce(page([task({ id: 't2', title: 'Second quest' })], 2, 2));
    renderView();

    await screen.findByText('First quest');
    expect(screen.getByText('Load More')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Load More'));

    expect(await screen.findByText('Second quest')).toBeInTheDocument();
    expect(screen.getByText('First quest')).toBeInTheDocument();
    expect(tasksApi.listAllPaged).toHaveBeenLastCalledWith({
      archived: true,
      includeDone: true,
      page: 2,
      pageSize: 25,
    });
  });

  it('hides Load More once every archived quest is loaded', async () => {
    vi.mocked(tasksApi.listAllPaged).mockResolvedValue(page([task({})], 1, 1));
    renderView();

    await screen.findByText('Old quest');
    expect(screen.queryByText('Load More')).not.toBeInTheDocument();
  });
});
