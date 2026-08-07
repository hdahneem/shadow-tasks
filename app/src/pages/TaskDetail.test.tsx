import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TaskDetail } from './TaskDetail';
import { useStore } from '../store/useStore';
import { useAuthStore } from '../store/useAuthStore';
import { tasksApi, commentsApi } from '../api/services';
import { ApiError } from '../api/client';
import type { Attachment, Comment, Task } from '../types';

vi.mock('../api/services', () => ({
  tasksApi: {
    get: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    move: vi.fn(),
    duplicate: vi.fn(),
    setStatus: vi.fn(),
    addComment: vi.fn(),
    uploadAttachment: vi.fn(),
  },
  commentsApi: { remove: vi.fn(), update: vi.fn() },
  statusesApi: { listForProject: vi.fn().mockResolvedValue([]) },
  workspacesApi: { members: vi.fn().mockResolvedValue([]) },
  assigneesApi: { add: vi.fn(), remove: vi.fn() },
  tagsApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  taskTagsApi: { add: vi.fn(), remove: vi.fn() },
  dependenciesApi: { create: vi.fn(), remove: vi.fn() },
  relationsApi: { create: vi.fn(), remove: vi.fn() },
  fieldsApi: { setValue: vi.fn() },
  timeEntriesApi: { start: vi.fn(), stop: vi.fn(), logManual: vi.fn(), remove: vi.fn() },
  shareApi: { enable: vi.fn(), revoke: vi.fn() },
  recurrenceApi: { create: vi.fn(), stop: vi.fn() },
  attachmentsApi: { remove: vi.fn() },
  taskTemplatesApi: { saveFromTask: vi.fn() },
}));

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    taskId: 't1',
    authorId: 'u1',
    author: { id: 'u1', name: 'Sung Jin-Woo' },
    body: 'A comment',
    createdAt: '2026-08-05T00:00:00.000Z',
    editedAt: null,
    parentCommentId: null,
    ...overrides,
  };
}

function baseTask(overrides: Partial<Task> = {}): Task {
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
    projectId: 'p1',
    workspaceId: 'w1',
    subtasks: [],
    comments: [],
    activity: [],
    attachments: [],
    customFields: [],
    dependsOn: [],
    blocks: [],
    relatedTasks: [],
    recurrence: null,
    assignees: [],
    timeEntries: [],
    ...overrides,
  };
}

function renderTaskDetail() {
  return render(
    <MemoryRouter initialEntries={['/tasks/t1']}>
      <Routes>
        <Route path="/tasks/:taskId" element={<TaskDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TaskDetail comment threading', () => {
  beforeEach(() => {
    useStore.setState({ refreshTasks: vi.fn().mockResolvedValue(undefined), lists: [] });
    useAuthStore.setState({ user: { id: 'u1', email: 'sung@example.com', name: 'Sung Jin-Woo' } });
  });

  it('nests replies beneath their parent comment', async () => {
    vi.mocked(tasksApi.get).mockResolvedValue(
      baseTask({
        comments: [
          comment({ id: 'c1', body: 'Top-level comment' }),
          comment({ id: 'c2', body: 'A reply', parentCommentId: 'c1', author: { id: 'u2', name: 'Cha Hae-In' } }),
        ],
      })
    );

    renderTaskDetail();

    expect(await screen.findByText('Top-level comment')).toBeInTheDocument();
    const reply = screen.getByText('A reply');
    expect(reply).toBeInTheDocument();
    // the reply sits inside the indented thread container, not as a sibling top-level comment
    expect(reply.closest('.border-l')).toBeTruthy();
  });

  it('shows no reply input until Reply is clicked', async () => {
    vi.mocked(tasksApi.get).mockResolvedValue(baseTask({ comments: [comment({})] }));
    renderTaskDetail();

    await screen.findByText('A comment');
    expect(screen.queryByPlaceholderText(/Reply to/)).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Reply' })[0]);
    expect(screen.getByPlaceholderText('Reply to Sung Jin-Woo...')).toBeInTheDocument();
  });

  it('submits a reply with the parent comment id', async () => {
    vi.mocked(tasksApi.get).mockResolvedValue(baseTask({ comments: [comment({ id: 'parent-1' })] }));
    vi.mocked(tasksApi.addComment).mockResolvedValue(comment({ id: 'reply-1', parentCommentId: 'parent-1' }));

    renderTaskDetail();
    await screen.findByText('A comment');

    fireEvent.click(screen.getAllByRole('button', { name: 'Reply' })[0]);
    fireEvent.change(screen.getByPlaceholderText('Reply to Sung Jin-Woo...'), { target: { value: 'My reply text' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Reply' })[1]);

    await waitFor(() =>
      expect(tasksApi.addComment).toHaveBeenCalledWith('t1', 'My reply text', 'parent-1')
    );
  });

  it('closes the reply form after a successful reply', async () => {
    vi.mocked(tasksApi.get).mockResolvedValue(baseTask({ comments: [comment({ id: 'parent-1' })] }));
    vi.mocked(tasksApi.addComment).mockResolvedValue(comment({ id: 'reply-1', parentCommentId: 'parent-1' }));

    renderTaskDetail();
    await screen.findByText('A comment');

    fireEvent.click(screen.getAllByRole('button', { name: 'Reply' })[0]);
    fireEvent.change(screen.getByPlaceholderText('Reply to Sung Jin-Woo...'), { target: { value: 'My reply text' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Reply' })[1]);

    await waitFor(() => expect(screen.queryByPlaceholderText(/Reply to/)).not.toBeInTheDocument());
  });

  it('deletes a comment when its author clicks Delete', async () => {
    vi.mocked(tasksApi.get).mockResolvedValue(baseTask({ comments: [comment({ id: 'c1', authorId: 'u1' })] }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderTaskDetail();
    await screen.findByText('A comment');
    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => expect(commentsApi.remove).toHaveBeenCalledWith('c1'));
  });

  it("does not show a comment-level Delete button on another author's comment", async () => {
    vi.mocked(tasksApi.get).mockResolvedValue(
      baseTask({ comments: [comment({ id: 'c1', authorId: 'someone-else' })] })
    );

    renderTaskDetail();
    await screen.findByText('A comment');
    // only the task-level Delete button should remain — the comment has none since we're not its author
    expect(screen.getAllByText('Delete')).toHaveLength(1);
  });

  it('shows the empty state when there are no comments', async () => {
    vi.mocked(tasksApi.get).mockResolvedValue(baseTask({ comments: [] }));
    renderTaskDetail();
    expect(await screen.findByText('No comments yet.')).toBeInTheDocument();
  });
});

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'a1',
    taskId: 't1',
    filename: 'photo.png',
    url: '/uploads/photo.png',
    mimeType: 'image/png',
    size: 1024,
    createdAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('TaskDetail attachments', () => {
  beforeEach(() => {
    useStore.setState({ refreshTasks: vi.fn().mockResolvedValue(undefined), lists: [] });
    useAuthStore.setState({ user: { id: 'u1', email: 'sung@example.com', name: 'Sung Jin-Woo' } });
  });

  it('renders an image thumbnail resolved against the API origin for image attachments', async () => {
    vi.mocked(tasksApi.get).mockResolvedValue(baseTask({ attachments: [attachment()] }));
    renderTaskDetail();
    const thumb = await screen.findByAltText('photo.png');
    expect(thumb.tagName).toBe('IMG');
    expect(thumb).toHaveAttribute('src', 'http://localhost:4000/uploads/photo.png');
  });

  it('shows a file-type badge instead of a thumbnail for non-image attachments', async () => {
    vi.mocked(tasksApi.get).mockResolvedValue(
      baseTask({ attachments: [attachment({ id: 'a2', filename: 'notes.pdf', mimeType: 'application/pdf' })] })
    );
    renderTaskDetail();
    await screen.findByText('notes.pdf');
    expect(screen.queryByAltText('notes.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('pdf')).toBeInTheDocument();
  });

  it('links the filename to the API-origin-resolved URL', async () => {
    vi.mocked(tasksApi.get).mockResolvedValue(baseTask({ attachments: [attachment()] }));
    renderTaskDetail();
    // the thumbnail and the filename text are both wrapped in their own link to the file
    const links = await screen.findAllByRole('link', { name: 'photo.png' });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', 'http://localhost:4000/uploads/photo.png');
    }
  });

  it('uploads a file and refreshes the attachment list', async () => {
    vi.mocked(tasksApi.get).mockResolvedValue(baseTask({ attachments: [] }));
    vi.mocked(tasksApi.uploadAttachment).mockResolvedValue(attachment());
    renderTaskDetail();
    await screen.findByText('No attachments yet.');

    const file = new File(['data'], 'photo.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(tasksApi.uploadAttachment).toHaveBeenCalledWith('t1', file));
  });

  it('shows an error toast when the server rejects an upload (e.g. a disallowed file type)', async () => {
    const { useToastStore } = await import('../store/useToastStore');
    useToastStore.setState({ toasts: [] });
    vi.mocked(tasksApi.get).mockResolvedValue(baseTask({ attachments: [] }));
    vi.mocked(tasksApi.uploadAttachment).mockRejectedValue(
      new ApiError(400, 'File type "image/svg+xml" is not allowed.')
    );
    renderTaskDetail();
    await screen.findByText('No attachments yet.');

    const file = new File(['<svg></svg>'], 'evil.svg', { type: 'image/svg+xml' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((t) => t.message)).toContain(
        'File type "image/svg+xml" is not allowed.'
      )
    );
  });
});
