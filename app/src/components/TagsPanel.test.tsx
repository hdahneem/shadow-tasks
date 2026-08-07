import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { TagsPanel } from './TagsPanel';
import { tagsApi, taskTagsApi } from '../api/services';
import { ApiError } from '../api/client';
import type { Tag, Task } from '../types';

vi.mock('../api/services', () => ({
  tagsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  taskTagsApi: { add: vi.fn(), remove: vi.fn() },
}));

function baseTask(overrides: Partial<Task>): Task {
  return {
    id: 't-main',
    listId: 'l1',
    parentTaskId: null,
    title: 'Clear the gate',
    priority: 'medium',
    done: false,
    position: 0,
    createdAt: '',
    updatedAt: '',
    progress: 0,
    workspaceId: 'w1',
    tags: [],
    ...overrides,
  };
}

function tag(id: string, name: string, color = '#22d3ee'): Tag {
  return { id, workspaceId: 'w1', name, color, createdAt: '' };
}

describe('TagsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tagsApi.list).mockResolvedValue([tag('tag1', 'Urgent'), tag('tag2', 'Bug', '#f43f5e')]);
  });

  it('shows "No tags yet." when the task has no tags', () => {
    render(<TagsPanel task={baseTask({})} onChanged={vi.fn()} />);
    expect(screen.getByText('No tags yet.')).toBeInTheDocument();
  });

  it('renders each tag on the task by name', () => {
    render(<TagsPanel task={baseTask({ tags: [tag('tag1', 'Urgent')] })} onChanged={vi.fn()} />);
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.queryByText('No tags yet.')).not.toBeInTheDocument();
  });

  it('offers workspace tags as candidates, excluding those already on the task', async () => {
    render(<TagsPanel task={baseTask({ tags: [tag('tag1', 'Urgent')] })} onChanged={vi.fn()} />);
    await waitFor(() => expect(tagsApi.list).toHaveBeenCalledWith('w1'));

    fireEvent.click(screen.getByText('+ Add Tag'));
    const select = screen.getByText('Select a tag…').closest('select')!;
    expect(within(select).queryByText('Urgent')).not.toBeInTheDocument();
    expect(within(select).getByText('Bug')).toBeInTheDocument();
    expect(within(select).getByText('+ New tag…')).toBeInTheDocument();
  });

  it('attaches an existing tag and reports the change', async () => {
    vi.mocked(taskTagsApi.add).mockResolvedValue(tag('tag2', 'Bug', '#f43f5e'));
    const onChanged = vi.fn();
    render(<TagsPanel task={baseTask({})} onChanged={onChanged} />);
    await waitFor(() => expect(tagsApi.list).toHaveBeenCalled());

    fireEvent.click(screen.getByText('+ Add Tag'));
    fireEvent.change(screen.getByText('Select a tag…').closest('select')!, { target: { value: 'tag2' } });
    fireEvent.click(screen.getByText('Add Tag'));

    await waitFor(() => expect(taskTagsApi.add).toHaveBeenCalledWith('t-main', 'tag2'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('creates a brand new tag and attaches it', async () => {
    vi.mocked(tagsApi.create).mockResolvedValue(tag('tag3', 'Epic', '#a855f7'));
    vi.mocked(taskTagsApi.add).mockResolvedValue(tag('tag3', 'Epic', '#a855f7'));
    const onChanged = vi.fn();
    render(<TagsPanel task={baseTask({})} onChanged={onChanged} />);
    await waitFor(() => expect(tagsApi.list).toHaveBeenCalled());

    fireEvent.click(screen.getByText('+ Add Tag'));
    fireEvent.change(screen.getByText('Select a tag…').closest('select')!, { target: { value: '__create_new__' } });
    fireEvent.change(screen.getByPlaceholderText('Tag name'), { target: { value: 'Epic' } });
    fireEvent.click(screen.getByText('Create & Add'));

    await waitFor(() => expect(tagsApi.create).toHaveBeenCalledWith('w1', 'Epic', '#7c93b3'));
    await waitFor(() => expect(taskTagsApi.add).toHaveBeenCalledWith('t-main', 'tag3'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('shows a server error when creating a tag fails', async () => {
    vi.mocked(tagsApi.create).mockRejectedValue(
      new ApiError(409, 'A tag with that name already exists in this workspace')
    );
    render(<TagsPanel task={baseTask({})} onChanged={vi.fn()} />);
    await waitFor(() => expect(tagsApi.list).toHaveBeenCalled());

    fireEvent.click(screen.getByText('+ Add Tag'));
    fireEvent.change(screen.getByText('Select a tag…').closest('select')!, { target: { value: '__create_new__' } });
    fireEvent.change(screen.getByPlaceholderText('Tag name'), { target: { value: 'Urgent' } });
    fireEvent.click(screen.getByText('Create & Add'));

    expect(await screen.findByText('A tag with that name already exists in this workspace')).toBeInTheDocument();
  });

  it('goes straight to the create-new form when the workspace has no tags yet', async () => {
    vi.mocked(tagsApi.list).mockResolvedValue([]);
    render(<TagsPanel task={baseTask({})} onChanged={vi.fn()} />);
    await waitFor(() => expect(tagsApi.list).toHaveBeenCalled());

    fireEvent.click(screen.getByText('+ Add Tag'));

    expect(screen.queryByText('Select a tag…')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Tag name')).toBeInTheDocument();
    expect(screen.getByText('Create & Add')).toBeInTheDocument();
  });

  it('removes a tag and reports the change', async () => {
    vi.mocked(taskTagsApi.remove).mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(<TagsPanel task={baseTask({ tags: [tag('tag1', 'Urgent')] })} onChanged={onChanged} />);

    fireEvent.click(screen.getByLabelText('Remove Urgent tag'));

    await waitFor(() => expect(taskTagsApi.remove).toHaveBeenCalledWith('t-main', 'tag1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
