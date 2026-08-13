import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProjectView } from './ProjectView';
import { useStore } from '../store/useStore';
import { tasksApi, tagsApi } from '../api/services';
import type { Project, Task, TodoList, WorkspaceRole } from '../types';

vi.mock('../api/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/services')>();
  return {
    ...actual,
    tasksApi: { ...actual.tasksApi, update: vi.fn(), archive: vi.fn(), remove: vi.fn(), duplicate: vi.fn() },
    tagsApi: { ...actual.tagsApi, list: vi.fn() },
  };
});

function project(effectiveRole: WorkspaceRole): Project {
  return {
    id: 'p1',
    workspaceId: 'w1',
    folderId: null,
    name: 'Clear the Red Gate',
    rank: 'D',
    createdAt: '',
    effectiveRole,
  };
}

function list(overrides: Partial<TodoList> = {}): TodoList {
  return { id: 'l1', projectId: 'p1', name: 'Prep', createdAt: '', ...overrides };
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

function renderProjectView() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1']}>
      <Routes>
        <Route path="/projects/:projectId" element={<ProjectView />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProjectView admin gating (via effectiveRole, not workspace role)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tagsApi.list).mockResolvedValue([]);
  });

  it('shows admin-only controls when the project effective role is admin, even if the workspace role is lower', () => {
    useStore.setState({
      projects: [project('admin')],
      lists: [],
      tasks: [],
      workspaces: [{ id: 'w1', name: 'Guild Hall', ownerId: 'someone-else', role: 'viewer', createdAt: '' }],
    });

    renderProjectView();

    expect(screen.getByRole('button', { name: 'Statuses' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fields' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Automations' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Access' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('hides admin-only controls when the project effective role is viewer, even if the workspace role is admin', () => {
    useStore.setState({
      projects: [project('viewer')],
      lists: [],
      tasks: [],
      workspaces: [{ id: 'w1', name: 'Guild Hall', ownerId: 'someone-else', role: 'admin', createdAt: '' }],
    });

    renderProjectView();

    expect(screen.queryByRole('button', { name: 'Statuses' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fields' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Automations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Access' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    // "+ Add List" form requires member+, also hidden for a viewer
    expect(screen.queryByPlaceholderText('New list name...')).not.toBeInTheDocument();
  });

  it('always shows the Board/Table/Timeline view switcher regardless of role', () => {
    useStore.setState({
      projects: [project('viewer')],
      lists: [],
      tasks: [],
      workspaces: [],
    });

    renderProjectView();

    expect(screen.getByRole('button', { name: 'Board' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Table' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timeline' })).toBeInTheDocument();
  });

  it('shows a not-found message for an unknown project', () => {
    useStore.setState({ projects: [], lists: [], tasks: [], workspaces: [] });
    renderProjectView();
    expect(screen.getByText('Project not found.')).toBeInTheDocument();
  });
});

describe('ProjectView bulk selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tagsApi.list).mockResolvedValue([]);
  });

  it('enters select mode and shows a checkbox per quest, disabling drag while selecting', () => {
    useStore.setState({
      projects: [project('member')],
      lists: [list()],
      tasks: [task({ id: 't1', title: 'Quest one' })],
      workspaces: [],
    });
    renderProjectView();

    expect(screen.queryByLabelText('Select Quest one')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Select'));
    expect(screen.getByLabelText('Select Quest one')).toBeInTheDocument();
    expect(screen.getByText('Quest one').closest('[draggable="true"]')).toBeNull();
  });

  it('bulk-completes selected quests and clears selection', async () => {
    const rows = [task({ id: 't1', title: 'Quest one', done: false })];
    useStore.setState({
      projects: [project('member')],
      lists: [list()],
      tasks: rows,
      workspaces: [],
      hunter: { level: 1, xp: 0, tasksCompleted: 0, highestLevel: 1 },
    });
    vi.mocked(tasksApi.update).mockResolvedValue({ ...rows[0], done: true });
    renderProjectView();

    fireEvent.click(screen.getByText('Select'));
    fireEvent.click(screen.getByLabelText('Select Quest one'));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Complete'));

    await waitFor(() => expect(tasksApi.update).toHaveBeenCalledWith('t1', { done: true }));
    await waitFor(() => expect(screen.queryByText(/selected/)).not.toBeInTheDocument());
  });

  it('bulk-archives selected quests only after confirmation', async () => {
    const rows = [task({ id: 't1', title: 'Quest one' })];
    useStore.setState({ projects: [project('member')], lists: [list()], tasks: rows, workspaces: [] });
    vi.mocked(tasksApi.archive).mockResolvedValue({ ...rows[0], archivedAt: new Date().toISOString() });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderProjectView();

    fireEvent.click(screen.getByText('Select'));
    fireEvent.click(screen.getByLabelText('Select Quest one'));
    fireEvent.click(screen.getByText('Archive'));

    await waitFor(() => expect(tasksApi.archive).toHaveBeenCalledWith('t1'));
  });

  it('does not bulk-archive when confirmation is cancelled', () => {
    const rows = [task({ id: 't1', title: 'Quest one' })];
    useStore.setState({ projects: [project('member')], lists: [list()], tasks: rows, workspaces: [] });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderProjectView();

    fireEvent.click(screen.getByText('Select'));
    fireEvent.click(screen.getByLabelText('Select Quest one'));
    fireEvent.click(screen.getByText('Archive'));

    expect(tasksApi.archive).not.toHaveBeenCalled();
  });

  it('duplicates selected quests via the Actions menu', async () => {
    const rows = [task({ id: 't1', title: 'Quest one' })];
    useStore.setState({ projects: [project('member')], lists: [list()], tasks: rows, workspaces: [] });
    vi.mocked(tasksApi.duplicate).mockResolvedValue(task({ id: 't1-copy', title: 'Quest one (copy)' }));
    renderProjectView();

    fireEvent.click(screen.getByText('Select'));
    fireEvent.click(screen.getByLabelText('Select Quest one'));
    fireEvent.click(screen.getByText('Actions ▾'));
    fireEvent.click(screen.getByText('Duplicate'));

    await waitFor(() => expect(tasksApi.duplicate).toHaveBeenCalledWith('t1'));
  });

  it('does not show the Select control for a viewer', () => {
    useStore.setState({ projects: [project('viewer')], lists: [list()], tasks: [], workspaces: [] });
    renderProjectView();
    expect(screen.queryByText('Select')).not.toBeInTheDocument();
  });
});
