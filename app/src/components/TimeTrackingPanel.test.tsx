import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TimeTrackingPanel } from './TimeTrackingPanel';
import { timeEntriesApi, tasksApi } from '../api/services';
import { useAuthStore } from '../store/useAuthStore';
import { ApiError } from '../api/client';
import type { Task, TimeEntry } from '../types';

vi.mock('../api/services', () => ({
  timeEntriesApi: { start: vi.fn(), stop: vi.fn(), logManual: vi.fn(), update: vi.fn(), remove: vi.fn() },
  tasksApi: { update: vi.fn() },
}));

function baseTask(overrides: Partial<Task>): Task {
  return {
    id: 't-main',
    listId: 'l1',
    parentTaskId: null,
    title: 'Grind mobs',
    priority: 'medium',
    done: false,
    position: 0,
    createdAt: '',
    updatedAt: '',
    progress: 0,
    estimatedMinutes: null,
    timeEntries: [],
    ...overrides,
  };
}

function entry(overrides: Partial<TimeEntry>): TimeEntry {
  return {
    id: 'e1',
    userId: 'me',
    userName: 'Me',
    startedAt: '2026-08-01T10:00:00.000Z',
    endedAt: '2026-08-01T10:30:00.000Z',
    note: null,
    ...overrides,
  };
}

describe('TimeTrackingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 'me', email: 'me@example.com', name: 'Me' } });
  });

  it('shows "Start Timer" when the current user has no running entry', () => {
    render(<TimeTrackingPanel task={baseTask({})} onChanged={vi.fn()} />);
    expect(screen.getByText('Start Timer')).toBeInTheDocument();
  });

  it('shows "Stop Timer" when the current user has a running entry', () => {
    render(
      <TimeTrackingPanel
        task={baseTask({ timeEntries: [entry({ id: 'r1', userId: 'me', endedAt: null })] })}
        onChanged={vi.fn()}
      />
    );
    expect(screen.getByText('Stop Timer')).toBeInTheDocument();
  });

  it('displays the total logged time from completed entries', () => {
    render(
      <TimeTrackingPanel
        task={baseTask({
          timeEntries: [
            entry({ id: 'e1', startedAt: '2026-08-01T10:00:00.000Z', endedAt: '2026-08-01T10:30:00.000Z' }),
            entry({ id: 'e2', startedAt: '2026-08-01T11:00:00.000Z', endedAt: '2026-08-01T12:00:00.000Z' }),
          ],
        })}
        onChanged={vi.fn()}
      />
    );
    expect(screen.getByText('1h 30m')).toBeInTheDocument();
  });

  it('starts a timer and reports the change', async () => {
    vi.mocked(timeEntriesApi.start).mockResolvedValue(entry({ endedAt: null }));
    const onChanged = vi.fn();
    render(<TimeTrackingPanel task={baseTask({})} onChanged={onChanged} />);

    fireEvent.click(screen.getByText('Start Timer'));

    await waitFor(() => expect(timeEntriesApi.start).toHaveBeenCalledWith('t-main'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('stops the running timer and reports the change', async () => {
    vi.mocked(timeEntriesApi.stop).mockResolvedValue(entry({}));
    const onChanged = vi.fn();
    render(
      <TimeTrackingPanel
        task={baseTask({ timeEntries: [entry({ id: 'r1', userId: 'me', endedAt: null })] })}
        onChanged={onChanged}
      />
    );

    fireEvent.click(screen.getByText('Stop Timer'));

    await waitFor(() => expect(timeEntriesApi.stop).toHaveBeenCalledWith('t-main'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('shows an error when starting the timer fails', async () => {
    vi.mocked(timeEntriesApi.start).mockRejectedValue(
      new ApiError(409, 'You already have a timer running on another quest. Stop it first.')
    );
    render(<TimeTrackingPanel task={baseTask({})} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByText('Start Timer'));

    expect(
      await screen.findByText('You already have a timer running on another quest. Stop it first.')
    ).toBeInTheDocument();
  });

  it('saves the estimate when the input is blurred', async () => {
    render(<TimeTrackingPanel task={baseTask({})} onChanged={vi.fn()} />);

    const input = screen.getByLabelText('Estimated minutes');
    fireEvent.change(input, { target: { value: '45' } });
    fireEvent.blur(input);

    await waitFor(() => expect(tasksApi.update).toHaveBeenCalledWith('t-main', { estimatedMinutes: 45 }));
  });

  it('logs a manual time entry', async () => {
    vi.mocked(timeEntriesApi.logManual).mockResolvedValue(entry({}));
    const onChanged = vi.fn();
    render(<TimeTrackingPanel task={baseTask({})} onChanged={onChanged} />);

    fireEvent.click(screen.getByText('+ Log Time'));
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-08-01T10:00' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-08-01T10:30' } });
    fireEvent.click(screen.getByText('Log Time'));

    await waitFor(() => expect(timeEntriesApi.logManual).toHaveBeenCalledWith('t-main', expect.objectContaining({})));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('deletes a time entry', async () => {
    vi.mocked(timeEntriesApi.remove).mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(
      <TimeTrackingPanel task={baseTask({ timeEntries: [entry({ id: 'e1' })] })} onChanged={onChanged} />
    );

    fireEvent.click(screen.getByLabelText('Delete time entry'));

    await waitFor(() => expect(timeEntriesApi.remove).toHaveBeenCalledWith('e1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
