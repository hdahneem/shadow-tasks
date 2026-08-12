import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TodayView } from './TodayView';
import { useStore } from '../store/useStore';
import { todayApi, tasksApi } from '../api/services';
import type { Task } from '../types';

vi.mock('../api/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/services')>();
  return {
    ...actual,
    todayApi: { list: vi.fn(), setStatus: vi.fn() },
    tasksApi: { ...actual.tasksApi, update: vi.fn(), remove: vi.fn() },
  };
});

const TODAY = new Date().toISOString().slice(0, 10);

function task(overrides: Partial<Task>): Task {
  return {
    id: overrides.id ?? 't1',
    listId: 'l1',
    parentTaskId: null,
    title: 'Untitled quest',
    priority: 'medium',
    done: false,
    position: 0,
    createdAt: '',
    updatedAt: '',
    progress: 0,
    ...overrides,
  };
}

function renderView() {
  return render(
    <MemoryRouter>
      <TodayView />
    </MemoryRouter>
  );
}

describe('TodayView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ tasks: [], todayEntries: {} });
    vi.mocked(todayApi.list).mockResolvedValue({ date: TODAY, entries: [] });
  });

  it('shows the empty state when there is nothing planned and nothing to suggest', async () => {
    renderView();
    expect(
      await screen.findByText(/Nothing planned for today yet/)
    ).toBeInTheDocument();
  });

  it('automatically shows a task whose startDate is today', async () => {
    useStore.setState({ tasks: [task({ id: 'a', title: 'Clear the gate', startDate: `${TODAY}T00:00:00.000Z` })] });
    renderView();
    expect(await screen.findByText('Clear the gate')).toBeInTheDocument();
  });

  it('suggests an overdue task with its reason, separately from the main list', async () => {
    useStore.setState({
      tasks: [task({ id: 'a', title: 'Slay the boss', dueDate: '2000-01-01T00:00:00.000Z' })],
    });
    renderView();
    expect(await screen.findByText('Slay the boss')).toBeInTheDocument();
    expect(screen.getByText('Suggestions')).toBeInTheDocument();
    expect(screen.getByText(/Overdue by/)).toBeInTheDocument();
  });

  it('accepting a suggestion adds it to today\'s list and persists via the API', async () => {
    useStore.setState({
      tasks: [task({ id: 'a', title: 'Slay the boss', dueDate: '2000-01-01T00:00:00.000Z' })],
    });
    vi.mocked(todayApi.setStatus).mockResolvedValue({ taskId: 'a', status: 'added' });
    renderView();

    fireEvent.click(await screen.findByTitle('Add to today'));

    await waitFor(() => expect(todayApi.setStatus).toHaveBeenCalledWith('a', 'added'));
    expect(useStore.getState().todayEntries.a).toBe('added');
  });

  it('dismissing a suggestion removes it without adding it to today\'s list', async () => {
    useStore.setState({
      tasks: [task({ id: 'a', title: 'Slay the boss', dueDate: '2000-01-01T00:00:00.000Z' })],
    });
    vi.mocked(todayApi.setStatus).mockResolvedValue({ taskId: 'a', status: 'dismissed' });
    renderView();

    fireEvent.click(await screen.findByTitle('Dismiss suggestion'));

    await waitFor(() => expect(todayApi.setStatus).toHaveBeenCalledWith('a', 'dismissed'));
    expect(useStore.getState().todayEntries.a).toBe('dismissed');
  });

  it('removing a task from today\'s list dismisses it (does not delete the task itself)', async () => {
    useStore.setState({ tasks: [task({ id: 'a', title: 'Clear the gate', startDate: `${TODAY}T00:00:00.000Z` })] });
    vi.mocked(todayApi.setStatus).mockResolvedValue({ taskId: 'a', status: 'dismissed' });
    renderView();

    fireEvent.click(await screen.findByTitle('Remove from today'));

    await waitFor(() => expect(todayApi.setStatus).toHaveBeenCalledWith('a', 'dismissed'));
    expect(tasksApi.remove).not.toHaveBeenCalled();
  });

  it('opens the add-from-any-list modal', async () => {
    renderView();
    fireEvent.click(await screen.findByText('+ Add from any list'));
    expect(await screen.findByText('Add to Today')).toBeInTheDocument();
  });
});
