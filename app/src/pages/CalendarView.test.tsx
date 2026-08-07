import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CalendarView } from './CalendarView';
import { useStore } from '../store/useStore';
import { tasksApi } from '../api/services';
import type { Task } from '../types';
import { monthLabel } from '../lib/calendar';

vi.mock('../api/services', () => ({
  tasksApi: { update: vi.fn() },
}));

function baseTask(overrides: Partial<Task>): Task {
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

function mockDataTransfer(taskId: string) {
  const store: Record<string, string> = { 'text/plain': taskId };
  return {
    setData: (type: string, value: string) => {
      store[type] = value;
    },
    getData: (type: string) => store[type] ?? '',
    effectAllowed: '',
  };
}

function renderCalendar() {
  return render(
    <MemoryRouter>
      <CalendarView />
    </MemoryRouter>
  );
}

const fixedNow = new Date(Date.UTC(2026, 7, 15)); // Aug 15 2026

describe('CalendarView', () => {
  beforeEach(() => {
    vi.setSystemTime(fixedNow);
    vi.mocked(tasksApi.update).mockImplementation(async (id, patch) => ({
      ...baseTask({ id }),
      ...patch,
    }));
  });

  it('shows the current month by default and places a task on its due date', () => {
    useStore.setState({
      tasks: [baseTask({ id: 't1', title: 'Slay the ice elves', dueDate: '2026-08-10T00:00:00.000Z' })],
    });
    renderCalendar();

    expect(screen.getByText(monthLabel(2026, 7))).toBeInTheDocument();
    expect(screen.getByText('Slay the ice elves')).toBeInTheDocument();
  });

  it('lists tasks with no due date in the Unscheduled rail', () => {
    useStore.setState({
      tasks: [baseTask({ id: 't2', title: 'Scout the entrance', dueDate: undefined })],
    });
    renderCalendar();

    expect(screen.getByText('Unscheduled')).toBeInTheDocument();
    expect(screen.getByText('Scout the entrance')).toBeInTheDocument();
  });

  it('navigates to the next and previous month', () => {
    useStore.setState({ tasks: [] });
    renderCalendar();

    fireEvent.click(screen.getByText('Next →'));
    expect(screen.getByText(monthLabel(2026, 8))).toBeInTheDocument();

    fireEvent.click(screen.getByText('← Prev'));
    fireEvent.click(screen.getByText('← Prev'));
    expect(screen.getByText(monthLabel(2026, 6))).toBeInTheDocument();

    fireEvent.click(screen.getByText('Today'));
    expect(screen.getByText(monthLabel(2026, 7))).toBeInTheDocument();
  });

  it('reschedules a task when dropped on a different day', () => {
    useStore.setState({
      tasks: [baseTask({ id: 't3', title: 'Defeat the ice queen', dueDate: '2026-08-05T00:00:00.000Z' })],
      updateTask: useStore.getState().updateTask,
    });
    renderCalendar();

    const chip = screen.getByText('Defeat the ice queen');
    const targetDay = screen.getByText('20').closest('div')!;

    fireEvent.drop(targetDay, { dataTransfer: mockDataTransfer('t3') });

    expect(tasksApi.update).toHaveBeenCalledWith('t3', { dueDate: '2026-08-20T00:00:00.000Z' });
    void chip;
  });

  it('clears a task\'s due date when dropped on the Unscheduled rail', () => {
    useStore.setState({
      tasks: [baseTask({ id: 't4', title: 'Break the shield', dueDate: '2026-08-05T00:00:00.000Z' })],
    });
    renderCalendar();

    const rail = screen.getByText('Nothing waiting to be scheduled.').parentElement!;
    fireEvent.drop(rail, { dataTransfer: mockDataTransfer('t4') });

    expect(tasksApi.update).toHaveBeenCalledWith('t4', { dueDate: null });
  });
});
