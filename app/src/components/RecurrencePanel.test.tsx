import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecurrencePanel } from './RecurrencePanel';
import { recurrenceApi } from '../api/services';
import { ApiError } from '../api/client';
import type { Task, RecurrenceRule } from '../types';

vi.mock('../api/services', () => ({
  recurrenceApi: { create: vi.fn(), update: vi.fn(), stop: vi.fn() },
}));

function baseTask(overrides: Partial<Task>): Task {
  return {
    id: 't-main',
    listId: 'l1',
    parentTaskId: null,
    title: 'Water the plants',
    priority: 'medium',
    done: false,
    position: 0,
    createdAt: '',
    updatedAt: '',
    progress: 0,
    dueDate: null,
    recurrence: null,
    ...overrides,
  };
}

function rule(overrides: Partial<RecurrenceRule>): RecurrenceRule {
  return {
    id: 'r1',
    listId: 'l1',
    frequency: 'daily',
    interval: 1,
    mode: 'after_completion',
    skipWeekends: false,
    endDate: null,
    maxOccurrences: null,
    occurrenceCount: 1,
    active: true,
    nextRunAt: null,
    createdAt: '',
    ...overrides,
  };
}

describe('RecurrencePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a "Set Recurrence" button when the task does not repeat', () => {
    render(<RecurrencePanel task={baseTask({})} onChanged={vi.fn()} />);
    expect(screen.getByText('+ Set Recurrence')).toBeInTheDocument();
  });

  it('shows the cadence and occurrence count for an active rule', () => {
    render(
      <RecurrencePanel
        task={baseTask({ recurrence: rule({ frequency: 'weekly', interval: 2, occurrenceCount: 3 }) })}
        onChanged={vi.fn()}
      />
    );
    expect(screen.getByText('Every 2 weeks')).toBeInTheDocument();
    expect(screen.getByText('Occurrences so far: 3')).toBeInTheDocument();
    expect(screen.getByText('Stop Recurrence')).toBeInTheDocument();
  });

  it('uses singular unit phrasing when interval is 1', () => {
    render(<RecurrencePanel task={baseTask({ recurrence: rule({ frequency: 'monthly', interval: 1 }) })} onChanged={vi.fn()} />);
    expect(screen.getByText('Every month')).toBeInTheDocument();
  });

  it('shows a stopped message once the rule is inactive', () => {
    render(<RecurrencePanel task={baseTask({ recurrence: rule({ active: false, occurrenceCount: 4 }) })} onChanged={vi.fn()} />);
    expect(screen.getByText('Recurrence stopped after 4 occurrences.')).toBeInTheDocument();
    expect(screen.queryByText('Stop Recurrence')).not.toBeInTheDocument();
  });

  it('creates a recurrence rule with the chosen settings', async () => {
    vi.mocked(recurrenceApi.create).mockResolvedValue(rule({}));
    const onChanged = vi.fn();
    render(<RecurrencePanel task={baseTask({})} onChanged={onChanged} />);

    fireEvent.click(screen.getByText('+ Set Recurrence'));
    fireEvent.change(screen.getByLabelText('Interval'), { target: { value: '3' } });
    fireEvent.click(screen.getByText('Set Recurrence'));

    await waitFor(() =>
      expect(recurrenceApi.create).toHaveBeenCalledWith('t-main', {
        frequency: 'daily',
        interval: 3,
        mode: 'after_completion',
        skipWeekends: false,
        endDate: null,
        maxOccurrences: null,
      })
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('blocks fixed-schedule submission client-side when the task has no due date', async () => {
    render(<RecurrencePanel task={baseTask({ dueDate: null })} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByText('+ Set Recurrence'));
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'fixed_schedule' } });
    fireEvent.click(screen.getByText('Set Recurrence'));

    expect(await screen.findByText(/fixed-schedule recurrence needs one/i)).toBeInTheDocument();
    expect(recurrenceApi.create).not.toHaveBeenCalled();
  });

  it('shows a server error when creating recurrence fails', async () => {
    vi.mocked(recurrenceApi.create).mockRejectedValue(new ApiError(409, 'This quest already has a recurrence rule'));
    render(<RecurrencePanel task={baseTask({})} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByText('+ Set Recurrence'));
    fireEvent.click(screen.getByText('Set Recurrence'));

    expect(await screen.findByText('This quest already has a recurrence rule')).toBeInTheDocument();
  });

  it('stops recurrence and reports the change', async () => {
    vi.mocked(recurrenceApi.stop).mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(<RecurrencePanel task={baseTask({ recurrence: rule({}) })} onChanged={onChanged} />);

    fireEvent.click(screen.getByText('Stop Recurrence'));

    await waitFor(() => expect(recurrenceApi.stop).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
