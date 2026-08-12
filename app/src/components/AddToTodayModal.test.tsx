import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddToTodayModal } from './AddToTodayModal';
import { useStore } from '../store/useStore';
import { todayApi } from '../api/services';
import type { Task } from '../types';

vi.mock('../api/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/services')>();
  return { ...actual, todayApi: { list: vi.fn(), setStatus: vi.fn() } };
});

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

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

describe('AddToTodayModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setOnline(true);
    useStore.setState({ tasks: [], todayEntries: {} });
  });

  it('shows an offline-blocked message and no task list when offline', () => {
    setOnline(false);
    useStore.setState({ tasks: [task({ id: 'a', title: 'Clear the gate' })] });
    render(<AddToTodayModal onClose={() => {}} />);
    expect(screen.getByText(/You're offline/)).toBeInTheDocument();
    expect(screen.queryByText('Clear the gate')).not.toBeInTheDocument();
  });

  it('lists eligible tasks with their project/list context', () => {
    useStore.setState({
      tasks: [
        task({
          id: 'a',
          title: 'Clear the gate',
          list: { id: 'l1', name: 'Prep', project: { id: 'p1', name: 'Red Gate' } },
        }),
      ],
    });
    render(<AddToTodayModal onClose={() => {}} />);
    expect(screen.getByText('Clear the gate')).toBeInTheDocument();
    expect(screen.getByText('Red Gate / Prep')).toBeInTheDocument();
  });

  it('excludes done and archived tasks', () => {
    useStore.setState({
      tasks: [
        task({ id: 'a', title: 'Done quest', done: true }),
        task({ id: 'b', title: 'Archived quest', archivedAt: '2026-01-01T00:00:00.000Z' }),
      ],
    });
    render(<AddToTodayModal onClose={() => {}} />);
    expect(screen.queryByText('Done quest')).not.toBeInTheDocument();
    expect(screen.queryByText('Archived quest')).not.toBeInTheDocument();
  });

  it('excludes tasks already on today\'s list, whether automatic or manually added', () => {
    const today = new Date().toISOString().slice(0, 10);
    useStore.setState({
      tasks: [
        task({ id: 'a', title: 'Starts today', startDate: `${today}T00:00:00.000Z` }),
        task({ id: 'b', title: 'Manually added' }),
        task({ id: 'c', title: 'Not on the list' }),
      ],
      todayEntries: { b: 'added' },
    });
    render(<AddToTodayModal onClose={() => {}} />);
    expect(screen.queryByText('Starts today')).not.toBeInTheDocument();
    expect(screen.queryByText('Manually added')).not.toBeInTheDocument();
    expect(screen.getByText('Not on the list')).toBeInTheDocument();
  });

  it('filters candidates by search query', () => {
    useStore.setState({
      tasks: [task({ id: 'a', title: 'Clear the gate' }), task({ id: 'b', title: 'Slay the boss' })],
    });
    render(<AddToTodayModal onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Search tasks by title…'), { target: { value: 'boss' } });

    expect(screen.queryByText('Clear the gate')).not.toBeInTheDocument();
    expect(screen.getByText('Slay the boss')).toBeInTheDocument();
  });

  it('adding a task persists it via the API and removes it from the candidate list', async () => {
    useStore.setState({ tasks: [task({ id: 'a', title: 'Clear the gate' })] });
    vi.mocked(todayApi.setStatus).mockResolvedValue({ taskId: 'a', status: 'added' });
    render(<AddToTodayModal onClose={() => {}} />);

    fireEvent.click(screen.getByText('+ Add'));

    await waitFor(() => expect(todayApi.setStatus).toHaveBeenCalledWith('a', 'added'));
    await waitFor(() => expect(screen.queryByText('Clear the gate')).not.toBeInTheDocument());
  });

  it('shows an empty state when there is nothing left to add', () => {
    render(<AddToTodayModal onClose={() => {}} />);
    expect(screen.getByText(/Nothing left to add/)).toBeInTheDocument();
  });
});
