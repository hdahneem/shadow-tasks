import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AllQuestsView } from './AllQuestsView';
import { useStore } from '../store/useStore';
import { useAuthStore } from '../store/useAuthStore';
import { tasksApi, tagsApi, taskTagsApi } from '../api/services';
import type { PaginatedTasks, Tag, Task } from '../types';

vi.mock('../api/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/services')>();
  return {
    ...actual,
    tasksApi: {
      ...actual.tasksApi,
      listAllPaged: vi.fn(),
      listAll: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
      remove: vi.fn(),
    },
    tagsApi: { ...actual.tagsApi, list: vi.fn() },
    taskTagsApi: { ...actual.taskTagsApi, add: vi.fn() },
  };
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
    createdAt: new Date().toISOString(),
    updatedAt: '',
    progress: 0,
    assignees: [],
    ...overrides,
  };
}

function page(tasks: Task[], total = tasks.length, pageNum = 1): PaginatedTasks {
  return { tasks, total, page: pageNum, pageSize: 25 };
}

describe('AllQuestsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 'me', email: 'me@example.com', name: 'Me' } });
    useStore.setState({ currentWorkspaceId: null, tasks: [] });
    vi.mocked(tagsApi.list).mockResolvedValue([]);
    vi.mocked(tasksApi.listAllPaged).mockResolvedValue(page([]));
  });

  it('shows every active quest by default', async () => {
    vi.mocked(tasksApi.listAllPaged).mockResolvedValue(
      page([
        task({ id: 't1', title: 'Assigned to me', assignees: [{ id: 'me', name: 'Me' }] }),
        task({ id: 't2', title: 'Assigned to someone else', assignees: [{ id: 'other', name: 'Other' }] }),
        task({ id: 't3', title: 'Unassigned' }),
      ])
    );
    render(
      <MemoryRouter>
        <AllQuestsView />
      </MemoryRouter>
    );
    expect(await screen.findByText('Assigned to me')).toBeInTheDocument();
    expect(screen.getByText('Assigned to someone else')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('filters to only quests assigned to the current user when "Only mine" is checked', async () => {
    vi.mocked(tasksApi.listAllPaged).mockResolvedValue(
      page([
        task({ id: 't1', title: 'Assigned to me', assignees: [{ id: 'me', name: 'Me' }] }),
        task({ id: 't2', title: 'Assigned to someone else', assignees: [{ id: 'other', name: 'Other' }] }),
        task({ id: 't3', title: 'Unassigned' }),
      ])
    );
    render(
      <MemoryRouter>
        <AllQuestsView />
      </MemoryRouter>
    );
    await screen.findByText('Assigned to me');

    fireEvent.click(screen.getByText('Only mine'));

    expect(screen.getByText('Assigned to me')).toBeInTheDocument();
    expect(screen.queryByText('Assigned to someone else')).not.toBeInTheDocument();
    expect(screen.queryByText('Unassigned')).not.toBeInTheDocument();
  });

  it('un-filters when "Only mine" is unchecked again', async () => {
    vi.mocked(tasksApi.listAllPaged).mockResolvedValue(
      page([
        task({ id: 't1', title: 'Assigned to me', assignees: [{ id: 'me', name: 'Me' }] }),
        task({ id: 't2', title: 'Assigned to someone else', assignees: [{ id: 'other', name: 'Other' }] }),
      ])
    );
    render(
      <MemoryRouter>
        <AllQuestsView />
      </MemoryRouter>
    );
    await screen.findByText('Assigned to me');

    const toggle = screen.getByText('Only mine');
    fireEvent.click(toggle);
    expect(screen.queryByText('Assigned to someone else')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByText('Assigned to someone else')).toBeInTheDocument();
  });

  it('does not refetch when "Only mine" is toggled (client-side filter only)', async () => {
    vi.mocked(tasksApi.listAllPaged).mockResolvedValue(
      page([task({ id: 't1', title: 'Assigned to me', assignees: [{ id: 'me', name: 'Me' }] })])
    );
    render(
      <MemoryRouter>
        <AllQuestsView />
      </MemoryRouter>
    );
    await screen.findByText('Assigned to me');
    expect(tasksApi.listAllPaged).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Only mine'));

    expect(tasksApi.listAllPaged).toHaveBeenCalledTimes(1);
  });

  it('resets to page 1 and requests includeDone when "Show cleared" is toggled', async () => {
    vi.mocked(tasksApi.listAllPaged).mockResolvedValue(page([task({ id: 't1', title: 'Quest one' })]));
    render(
      <MemoryRouter>
        <AllQuestsView />
      </MemoryRouter>
    );
    await screen.findByText('Quest one');
    expect(tasksApi.listAllPaged).toHaveBeenCalledTimes(1);
    expect(tasksApi.listAllPaged).toHaveBeenLastCalledWith({ includeDone: false, page: 1, pageSize: 25 });

    fireEvent.click(screen.getByText('Show cleared'));

    await waitFor(() => expect(tasksApi.listAllPaged).toHaveBeenCalledTimes(2));
    expect(tasksApi.listAllPaged).toHaveBeenLastCalledWith({ includeDone: true, page: 1, pageSize: 25 });
  });

  it('shows a Load More button and appends the next page when clicked', async () => {
    vi.mocked(tasksApi.listAllPaged)
      .mockResolvedValueOnce(page([task({ id: 't1', title: 'First quest' })], 2, 1))
      .mockResolvedValueOnce(page([task({ id: 't2', title: 'Second quest' })], 2, 2));
    render(
      <MemoryRouter>
        <AllQuestsView />
      </MemoryRouter>
    );

    await screen.findByText('First quest');
    expect(screen.getByText('Load More')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Load More'));

    expect(await screen.findByText('Second quest')).toBeInTheDocument();
    expect(screen.getByText('First quest')).toBeInTheDocument();
    expect(tasksApi.listAllPaged).toHaveBeenLastCalledWith({ includeDone: false, page: 2, pageSize: 25 });
  });

  it('enters select mode and shows a checkbox per quest', async () => {
    vi.mocked(tasksApi.listAllPaged).mockResolvedValue(page([task({ id: 't1', title: 'Quest one' })]));
    render(
      <MemoryRouter>
        <AllQuestsView />
      </MemoryRouter>
    );
    await screen.findByText('Quest one');

    expect(screen.queryByLabelText('Select Quest one')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Select'));
    expect(screen.getByLabelText('Select Quest one')).toBeInTheDocument();
  });

  it('shows the bulk toolbar once a quest is selected, and clears on Cancel', async () => {
    vi.mocked(tasksApi.listAllPaged).mockResolvedValue(page([task({ id: 't1', title: 'Quest one' })]));
    render(
      <MemoryRouter>
        <AllQuestsView />
      </MemoryRouter>
    );
    await screen.findByText('Quest one');

    fireEvent.click(screen.getByText('Select'));
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Select Quest one'));
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Select Quest one')).not.toBeInTheDocument();
  });

  it('bulk-completes selected quests', async () => {
    // bulkSetDone (store action) pre-filters via the global store's own `tasks` array,
    // separate from what AllQuestsView fetches for display — both need seeding.
    const rows = [task({ id: 't1', title: 'Quest one', done: false }), task({ id: 't2', title: 'Quest two', done: false })];
    useStore.setState({ tasks: rows, hunter: { level: 1, xp: 0, tasksCompleted: 0, highestLevel: 1 } });
    vi.mocked(tasksApi.listAllPaged).mockResolvedValue(page(rows));
    vi.mocked(tasksApi.update).mockImplementation(async (id, patch) => ({
      ...(rows.find((t) => t.id === id) as Task),
      ...patch,
    }));
    render(
      <MemoryRouter>
        <AllQuestsView />
      </MemoryRouter>
    );
    await screen.findByText('Quest one');

    fireEvent.click(screen.getByText('Select'));
    fireEvent.click(screen.getByLabelText('Select Quest one'));
    fireEvent.click(screen.getByLabelText('Select Quest two'));
    fireEvent.click(screen.getByText('Complete'));

    await waitFor(() => expect(tasksApi.update).toHaveBeenCalledWith('t1', { done: true }));
    await waitFor(() => expect(tasksApi.update).toHaveBeenCalledWith('t2', { done: true }));
    await waitFor(() => expect(screen.queryByText(/selected/)).not.toBeInTheDocument());
  });

  it('bulk-archives selected quests and removes them from the list', async () => {
    vi.mocked(tasksApi.listAllPaged).mockResolvedValue(page([task({ id: 't1', title: 'Quest one' })]));
    vi.mocked(tasksApi.archive).mockResolvedValue(task({ id: 't1', archivedAt: new Date().toISOString() }));
    render(
      <MemoryRouter>
        <AllQuestsView />
      </MemoryRouter>
    );
    await screen.findByText('Quest one');

    fireEvent.click(screen.getByText('Select'));
    fireEvent.click(screen.getByLabelText('Select Quest one'));
    fireEvent.click(screen.getByText('Archive'));

    await waitFor(() => expect(tasksApi.archive).toHaveBeenCalledWith('t1'));
    await waitFor(() => expect(screen.queryByText('Quest one')).not.toBeInTheDocument());
  });

  it('bulk-deletes selected quests after confirmation', async () => {
    vi.mocked(tasksApi.listAllPaged).mockResolvedValue(page([task({ id: 't1', title: 'Quest one' })]));
    vi.mocked(tasksApi.remove).mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <MemoryRouter>
        <AllQuestsView />
      </MemoryRouter>
    );
    await screen.findByText('Quest one');

    fireEvent.click(screen.getByText('Select'));
    fireEvent.click(screen.getByLabelText('Select Quest one'));
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => expect(tasksApi.remove).toHaveBeenCalledWith('t1'));
    await waitFor(() => expect(screen.queryByText('Quest one')).not.toBeInTheDocument());
  });

  it('does not bulk-delete when confirmation is cancelled', async () => {
    vi.mocked(tasksApi.listAllPaged).mockResolvedValue(page([task({ id: 't1', title: 'Quest one' })]));
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <MemoryRouter>
        <AllQuestsView />
      </MemoryRouter>
    );
    await screen.findByText('Quest one');

    fireEvent.click(screen.getByText('Select'));
    fireEvent.click(screen.getByLabelText('Select Quest one'));
    fireEvent.click(screen.getByText('Delete'));

    expect(tasksApi.remove).not.toHaveBeenCalled();
    expect(screen.getByText('Quest one')).toBeInTheDocument();
  });

  it('exports the visible quests as a CSV download, fetching a fresh unbounded set', async () => {
    vi.mocked(tasksApi.listAllPaged).mockResolvedValue(page([task({ id: 't1', title: 'Quest one' })]));
    vi.mocked(tasksApi.listAll).mockResolvedValue([task({ id: 't1', title: 'Quest one' })]);
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(
      <MemoryRouter>
        <AllQuestsView />
      </MemoryRouter>
    );
    await screen.findByText('Quest one');

    fireEvent.click(screen.getByText('Export CSV'));

    await waitFor(() => expect(tasksApi.listAll).toHaveBeenCalledWith(false));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('disables Export CSV when there are no quests to export', async () => {
    vi.mocked(tasksApi.listAllPaged).mockResolvedValue(page([]));
    render(
      <MemoryRouter>
        <AllQuestsView />
      </MemoryRouter>
    );
    await waitFor(() => expect(tasksApi.listAllPaged).toHaveBeenCalled());
    expect(screen.getByText('Export CSV')).toBeDisabled();
  });

  describe('bulk add tag', () => {
    const tags: Tag[] = [{ id: 'tag1', workspaceId: 'w1', name: 'Urgent', color: '#f43f5e', createdAt: '' }];

    it('does not show a tag picker when the workspace has no tags', async () => {
      useStore.setState({ currentWorkspaceId: 'w1' });
      vi.mocked(tasksApi.listAllPaged).mockResolvedValue(page([task({ id: 't1', title: 'Quest one' })]));
      render(
        <MemoryRouter>
          <AllQuestsView />
        </MemoryRouter>
      );
      await screen.findByText('Quest one');
      await waitFor(() => expect(tagsApi.list).toHaveBeenCalledWith('w1'));

      fireEvent.click(screen.getByText('Select'));
      fireEvent.click(screen.getByLabelText('Select Quest one'));

      expect(screen.queryByText('+ Tag…')).not.toBeInTheDocument();
    });

    it('applies a tag to selected quests and shows the pill', async () => {
      vi.mocked(tagsApi.list).mockResolvedValue(tags);
      vi.mocked(taskTagsApi.add).mockResolvedValue(tags[0]);
      const rows = [task({ id: 't1', title: 'Quest one', tags: [] })];
      useStore.setState({ currentWorkspaceId: 'w1', tasks: rows });
      vi.mocked(tasksApi.listAllPaged).mockResolvedValue(page(rows));
      render(
        <MemoryRouter>
          <AllQuestsView />
        </MemoryRouter>
      );
      await screen.findByText('Quest one');
      await waitFor(() => expect(tagsApi.list).toHaveBeenCalledWith('w1'));

      fireEvent.click(screen.getByText('Select'));
      fireEvent.click(screen.getByLabelText('Select Quest one'));
      const picker = await screen.findByText('+ Tag…');
      fireEvent.change(picker.closest('select')!, { target: { value: 'tag1' } });

      await waitFor(() => expect(taskTagsApi.add).toHaveBeenCalledWith('t1', 'tag1'));
      expect(await screen.findByText('Urgent')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByText(/selected/)).not.toBeInTheDocument());
    });

    it('skips quests that already have the tag', async () => {
      vi.mocked(tagsApi.list).mockResolvedValue(tags);
      vi.mocked(taskTagsApi.add).mockResolvedValue(tags[0]);
      const rows = [
        task({ id: 't1', title: 'Quest one', tags: [tags[0]] }),
        task({ id: 't2', title: 'Quest two', tags: [] }),
      ];
      useStore.setState({ currentWorkspaceId: 'w1', tasks: rows });
      vi.mocked(tasksApi.listAllPaged).mockResolvedValue(page(rows));
      render(
        <MemoryRouter>
          <AllQuestsView />
        </MemoryRouter>
      );
      await screen.findByText('Quest one');
      await waitFor(() => expect(tagsApi.list).toHaveBeenCalledWith('w1'));

      fireEvent.click(screen.getByText('Select'));
      fireEvent.click(screen.getByLabelText('Select Quest one'));
      fireEvent.click(screen.getByLabelText('Select Quest two'));
      const picker = await screen.findByText('+ Tag…');
      fireEvent.change(picker.closest('select')!, { target: { value: 'tag1' } });

      await waitFor(() => expect(taskTagsApi.add).toHaveBeenCalledWith('t2', 'tag1'));
      expect(taskTagsApi.add).not.toHaveBeenCalledWith('t1', 'tag1');
    });
  });
});
