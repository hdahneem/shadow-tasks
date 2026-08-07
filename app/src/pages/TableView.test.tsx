import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TableView } from './TableView';
import { useStore } from '../store/useStore';
import { statusesApi, tasksApi, fieldsApi } from '../api/services';
import type { CustomFieldDefinition, Status, Task } from '../types';

vi.mock('../api/services', () => ({
  statusesApi: { listForProject: vi.fn() },
  fieldsApi: { listForProject: vi.fn(), setValue: vi.fn() },
  tasksApi: { listForProject: vi.fn(), update: vi.fn() },
}));

const project = {
  id: 'p1',
  workspaceId: 'w1',
  folderId: null,
  name: 'Clear the Red Gate',
  rank: 'E' as const,
  createdAt: '',
  effectiveRole: 'admin' as const,
};

const statuses: Status[] = [
  { id: 's1', projectId: 'p1', name: 'To Do', color: '#7c93b3', position: 1, isCompleted: false, createdAt: '' },
  { id: 's2', projectId: 'p1', name: 'Done', color: '#4ade80', position: 2, isCompleted: true, createdAt: '' },
];

const fields: CustomFieldDefinition[] = [
  { id: 'f1', projectId: 'p1', name: 'Budget', type: 'currency', options: null, position: 0, createdAt: '' },
];

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

function renderTable() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1/table']}>
      <Routes>
        <Route path="/projects/:projectId/table" element={<TableView />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TableView', () => {
  beforeEach(() => {
    // many test files reuse projectId 'p1' as a generic placeholder, and jsdom's
    // localStorage can persist across files in the same worker — clear this
    // component's persisted column preference so tests don't leak into each other.
    localStorage.removeItem('shadow-tasks:table-columns:p1');
    useStore.setState({
      projects: [project],
      setTaskStatus: vi.fn().mockResolvedValue(baseTask({ statusId: 's2' })),
      refreshTasks: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(statusesApi.listForProject).mockResolvedValue(statuses);
    vi.mocked(fieldsApi.listForProject).mockResolvedValue(fields);
  });

  it('renders task rows with title, priority, due date, assignees, and custom field columns', async () => {
    vi.mocked(tasksApi.listForProject).mockResolvedValue([
      baseTask({
        id: 't1',
        title: 'Scout the entrance',
        statusId: 's1',
        dueDate: '2026-08-10T00:00:00.000Z',
        assignees: [{ id: 'u1', name: 'Lim Tae-Gyu' }],
        customFields: [{ id: 'f1', name: 'Budget', type: 'currency', options: null, value: 500 }],
      }),
    ]);

    renderTable();

    await waitFor(() => expect(screen.getByText('Scout the entrance')).toBeInTheDocument());
    expect(screen.getByText('Budget')).toBeInTheDocument();
    expect(screen.getByDisplayValue('500')).toBeInTheDocument();
    expect(screen.getByText('Lim Tae-Gyu')).toBeInTheDocument();
    expect(screen.getByText('Aug 10')).toBeInTheDocument();
  });

  it('edits a custom field value inline and persists the change locally', async () => {
    vi.mocked(tasksApi.listForProject).mockResolvedValue([
      baseTask({
        id: 't1',
        title: 'Scout the entrance',
        customFields: [{ id: 'f1', name: 'Budget', type: 'currency', options: null, value: 500 }],
      }),
    ]);
    vi.mocked(fieldsApi.setValue).mockResolvedValue({
      id: 'f1',
      name: 'Budget',
      type: 'currency',
      options: null,
      value: 750,
    });

    renderTable();
    await waitFor(() => expect(screen.getByText('Scout the entrance')).toBeInTheDocument());

    const input = screen.getByDisplayValue('500');
    fireEvent.change(input, { target: { value: '750' } });
    fireEvent.blur(input);

    await waitFor(() => expect(fieldsApi.setValue).toHaveBeenCalledWith('t1', 'f1', 750));
    expect(await screen.findByDisplayValue('750')).toBeInTheDocument();
  });

  it('shows an empty state when the project has no tasks', async () => {
    vi.mocked(tasksApi.listForProject).mockResolvedValue([]);
    renderTable();
    await waitFor(() => expect(screen.getByText('No quests in this project yet.')).toBeInTheDocument());
  });

  it('sorts rows by title and reverses direction on a second click', async () => {
    vi.mocked(tasksApi.listForProject).mockResolvedValue([
      baseTask({ id: 't1', title: 'Zephyr quest' }),
      baseTask({ id: 't2', title: 'Alpha quest' }),
    ]);

    renderTable();
    await waitFor(() => expect(screen.getByText('Zephyr quest')).toBeInTheDocument());

    const rowTitles = () => screen.getAllByRole('link').map((el) => el.textContent);
    expect(rowTitles()).toEqual(['Alpha quest', 'Zephyr quest']);

    fireEvent.click(screen.getByText(/^Title/));
    expect(rowTitles()).toEqual(['Zephyr quest', 'Alpha quest']);
  });

  it('changes a task priority via the priority dropdown', async () => {
    vi.mocked(tasksApi.listForProject).mockResolvedValue([baseTask({ id: 't1', title: 'Scout', priority: 'low' })]);
    vi.mocked(tasksApi.update).mockResolvedValue(baseTask({ id: 't1', title: 'Scout', priority: 'high' }));

    renderTable();
    await waitFor(() => expect(screen.getByText('Scout')).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue('Low'), { target: { value: 'high' } });

    await waitFor(() => expect(tasksApi.update).toHaveBeenCalledWith('t1', { priority: 'high' }));
  });

  it('changes a task status via the status dropdown', async () => {
    vi.mocked(tasksApi.listForProject).mockResolvedValue([
      baseTask({ id: 't1', title: 'Scout', statusId: 's1' }),
    ]);

    renderTable();
    await waitFor(() => expect(screen.getByText('Scout')).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue('To Do'), { target: { value: 's2' } });

    await waitFor(() => expect(useStore.getState().setTaskStatus).toHaveBeenCalledWith('t1', 's2'));
  });

  describe('column customization', () => {
    beforeEach(() => {
      vi.mocked(tasksApi.listForProject).mockResolvedValue([
        baseTask({
          id: 't1',
          title: 'Scout the entrance',
          dueDate: '2026-08-10T00:00:00.000Z',
          assignees: [{ id: 'u1', name: 'Lim Tae-Gyu' }],
          customFields: [{ id: 'f1', name: 'Budget', type: 'currency', options: null, value: 500 }],
        }),
      ]);
    });

    it('lists every toggleable column in the Columns dropdown', async () => {
      renderTable();
      await waitFor(() => expect(screen.getByText('Scout the entrance')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Columns'));

      expect(screen.getByText('Title (always shown)')).toBeInTheDocument();
      const [, menuHeading] = screen.getAllByText('Columns');
      const menu = menuHeading.parentElement!;
      expect(within(menu).getByText('Status')).toBeInTheDocument();
      expect(within(menu).getByText('Priority')).toBeInTheDocument();
      expect(within(menu).getByText('Due Date')).toBeInTheDocument();
      expect(within(menu).getByText('Assignees')).toBeInTheDocument();
      expect(within(menu).getByText('Budget')).toBeInTheDocument();
    });

    it('hides a column from the table when unchecked, keeping Title', async () => {
      renderTable();
      await waitFor(() => expect(screen.getByText('Scout the entrance')).toBeInTheDocument());
      expect(screen.getByText('Lim Tae-Gyu')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Columns'));
      fireEvent.click(screen.getByLabelText('Assignees'));

      expect(screen.queryByText('Lim Tae-Gyu')).not.toBeInTheDocument();
      expect(screen.getByText('Scout the entrance')).toBeInTheDocument();
    });

    it('moves a column earlier with the ▲ reorder button', async () => {
      renderTable();
      await waitFor(() => expect(screen.getByText('Scout the entrance')).toBeInTheDocument());

      const headersBefore = screen.getAllByRole('columnheader').map((th) => th.textContent);
      expect(headersBefore[1]).toMatch(/^Status/);

      fireEvent.click(screen.getByText('Columns'));
      fireEvent.click(screen.getByLabelText('Move Priority up'));

      const headersAfter = screen.getAllByRole('columnheader').map((th) => th.textContent);
      expect(headersAfter[1]).toMatch(/^Priority/);
      expect(headersAfter[2]).toMatch(/^Status/);
    });

    it('persists column visibility to localStorage, scoped per project', async () => {
      renderTable();
      await waitFor(() => expect(screen.getByText('Scout the entrance')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Columns'));
      fireEvent.click(screen.getByLabelText('Assignees'));

      const stored = JSON.parse(localStorage.getItem('shadow-tasks:table-columns:p1')!);
      const assigneesCol = stored.find((c: { id: string; visible: boolean }) => c.id === 'assignees');
      expect(assigneesCol.visible).toBe(false);
    });

    it('auto-shows a newly-created custom field even when a stale preference predates it', async () => {
      localStorage.setItem(
        'shadow-tasks:table-columns:p1',
        JSON.stringify([
          { id: 'status', visible: true },
          { id: 'priority', visible: true },
          { id: 'dueDate', visible: true },
          { id: 'assignees', visible: true },
        ])
      );

      renderTable();

      expect(await screen.findByText('Budget')).toBeInTheDocument();
    });
  });
});
