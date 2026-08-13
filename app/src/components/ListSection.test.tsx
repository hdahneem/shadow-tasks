import type { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ListSection } from './ListSection';
import { useStore } from '../store/useStore';
import type { Task, TodoList } from '../types';

function list(overrides: Partial<TodoList> = {}): TodoList {
  return { id: 'l1', projectId: 'p1', name: 'Dungeon Prep', createdAt: '', ...overrides };
}

function fileWithText(text: string, name = 'tasks.csv'): File {
  const file = new File([text], name, { type: 'text/csv' });
  vi.spyOn(file, 'text').mockResolvedValue(text);
  return file;
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
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

function dragAndDrop(sourceEl: Element, targetEl: Element) {
  fireEvent.dragStart(sourceEl);
  fireEvent.dragOver(targetEl);
  fireEvent.drop(targetEl);
  fireEvent.dragEnd(sourceEl);
}

function renderWithRouter(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('ListSection CSV import', () => {
  beforeEach(() => {
    useStore.setState({ tasks: [], addTask: vi.fn().mockResolvedValue(undefined) });
  });

  it('imports tasks from a valid CSV and reports the created count', async () => {
    const addTask = vi.fn().mockResolvedValue(undefined);
    useStore.setState({ addTask });

    render(<ListSection list={list()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const csv = 'Title,Priority,Due Date\nClear the gate,high,2026-08-10\nScout ahead,,';
    fireEvent.change(input, { target: { files: [fileWithText(csv)] } });

    await waitFor(() => expect(addTask).toHaveBeenCalledTimes(2));
    expect(addTask).toHaveBeenCalledWith('l1', 'Clear the gate', 'high', expect.stringContaining('2026-08-10'));
    expect(addTask).toHaveBeenCalledWith('l1', 'Scout ahead', 'medium', undefined);
    expect(await screen.findByText('Imported 2 quests.')).toBeInTheDocument();
  });

  it('shows an error message and does not create tasks when the Title column is missing', async () => {
    const addTask = vi.fn().mockResolvedValue(undefined);
    useStore.setState({ addTask });

    render(<ListSection list={list()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileWithText('Name\nSomething')] } });

    expect(await screen.findByText(/must have a "Title" column/)).toBeInTheDocument();
    expect(addTask).not.toHaveBeenCalled();
  });

  it('shows a message when the CSV has no importable rows', async () => {
    useStore.setState({ addTask: vi.fn() });
    render(<ListSection list={list()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileWithText('Title\n')] } });

    expect(await screen.findByText('No tasks found in that CSV.')).toBeInTheDocument();
  });

  it('does not render the Import CSV button when canEdit is false', () => {
    render(<ListSection list={list()} canEdit={false} />);
    expect(screen.queryByText('Import CSV')).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
  });
});

describe('ListSection task reordering', () => {
  beforeEach(() => {
    useStore.setState({ addTask: vi.fn().mockResolvedValue(undefined), reorderTask: vi.fn().mockResolvedValue(undefined) });
  });

  it('renders not-done tasks ordered by position', () => {
    useStore.setState({
      tasks: [
        task({ id: 't1', title: 'Third', position: 3 }),
        task({ id: 't2', title: 'First', position: 1 }),
        task({ id: 't3', title: 'Second', position: 2 }),
      ],
    });

    renderWithRouter(<ListSection list={list()} />);

    const titles = screen.getAllByText(/First|Second|Third/).map((el) => el.textContent);
    expect(titles).toEqual(['First', 'Second', 'Third']);
  });

  it('reorders by dropping a task onto another, using the midpoint of its new neighbors', () => {
    const reorderTask = vi.fn().mockResolvedValue(undefined);
    useStore.setState({
      reorderTask,
      tasks: [
        task({ id: 't1', title: 'Alpha', position: 1 }),
        task({ id: 't2', title: 'Bravo', position: 2 }),
        task({ id: 't3', title: 'Charlie', position: 3 }),
      ],
    });

    renderWithRouter(<ListSection list={list()} />);

    const alphaRow = screen.getByText('Alpha').closest('[draggable="true"]')!;
    const charlieRow = screen.getByText('Charlie').closest('[draggable="true"]')!;
    dragAndDrop(alphaRow, charlieRow);

    // dropping Alpha onto Charlie inserts it just before Charlie, between Bravo (2) and Charlie (3)
    expect(reorderTask).toHaveBeenCalledWith('t1', 2.5);
  });

  it('positions a task before the first item when dropped there', () => {
    const reorderTask = vi.fn().mockResolvedValue(undefined);
    useStore.setState({
      reorderTask,
      tasks: [
        task({ id: 't1', title: 'Alpha', position: 1 }),
        task({ id: 't2', title: 'Bravo', position: 2 }),
        task({ id: 't3', title: 'Charlie', position: 3 }),
      ],
    });

    renderWithRouter(<ListSection list={list()} />);

    const charlieRow = screen.getByText('Charlie').closest('[draggable="true"]')!;
    const alphaRow = screen.getByText('Alpha').closest('[draggable="true"]')!;
    dragAndDrop(charlieRow, alphaRow);

    expect(reorderTask).toHaveBeenCalledWith('t3', 0);
  });

  it('blocks a reorder drop while offline instead of calling reorderTask', () => {
    const reorderTask = vi.fn().mockResolvedValue(undefined);
    useStore.setState({
      reorderTask,
      tasks: [
        task({ id: 't1', title: 'Alpha', position: 1 }),
        task({ id: 't2', title: 'Bravo', position: 2 }),
      ],
    });
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    renderWithRouter(<ListSection list={list()} />);

    const alphaRow = screen.getByText('Alpha').closest('[draggable="true"]')!;
    const bravoRow = screen.getByText('Bravo').closest('[draggable="true"]')!;
    dragAndDrop(alphaRow, bravoRow);

    expect(reorderTask).not.toHaveBeenCalled();

    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('does not make rows draggable when canEdit is false', () => {
    useStore.setState({ tasks: [task({ id: 't1', title: 'Alpha', position: 1 })] });
    renderWithRouter(<ListSection list={list()} canEdit={false} />);
    expect(screen.getByText('Alpha').closest('[draggable="true"]')).toBeNull();
  });
});

describe('ListSection selection mode', () => {
  beforeEach(() => {
    useStore.setState({ addTask: vi.fn().mockResolvedValue(undefined), reorderTask: vi.fn().mockResolvedValue(undefined) });
  });

  it('shows a checkbox per task and calls onToggleSelect when selectable', () => {
    useStore.setState({ tasks: [task({ id: 't1', title: 'Alpha', position: 1 })] });
    const onToggleSelect = vi.fn();
    renderWithRouter(
      <ListSection list={list()} selectable selectedIds={new Set()} onToggleSelect={onToggleSelect} />
    );

    const checkbox = screen.getByLabelText('Select Alpha');
    fireEvent.click(checkbox);
    expect(onToggleSelect).toHaveBeenCalledWith('t1');
  });

  it('reflects selectedIds in the checkbox state', () => {
    useStore.setState({ tasks: [task({ id: 't1', title: 'Alpha', position: 1 })] });
    renderWithRouter(
      <ListSection list={list()} selectable selectedIds={new Set(['t1'])} onToggleSelect={vi.fn()} />
    );
    expect(screen.getByLabelText('Select Alpha')).toBeChecked();
  });

  it('disables drag while selection mode is active, even when canEdit is true', () => {
    useStore.setState({ tasks: [task({ id: 't1', title: 'Alpha', position: 1 })] });
    renderWithRouter(
      <ListSection list={list()} canEdit selectable selectedIds={new Set()} onToggleSelect={vi.fn()} />
    );
    expect(screen.getByText('Alpha').closest('[draggable="true"]')).toBeNull();
  });
});
