import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImportCsvModal } from './ImportCsvModal';
import { useStore } from '../store/useStore';
import { ApiError } from '../api/client';
import type { Task, Project, TodoList } from '../types';

function fileWithText(text: string, name = 'import.csv'): File {
  const file = new File([text], name, { type: 'text/csv' });
  vi.spyOn(file, 'text').mockResolvedValue(text);
  return file;
}

function mockTask(overrides: Partial<Task>): Task {
  return {
    id: overrides.id ?? 't1',
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

function project(overrides: Partial<Project>): Project {
  return {
    id: 'p1',
    workspaceId: 'w1',
    folderId: null,
    name: 'Existing Project',
    rank: 'E',
    createdAt: '',
    effectiveRole: 'admin',
    ...overrides,
  };
}

function list(overrides: Partial<TodoList>): TodoList {
  return { id: 'l1', projectId: 'p1', name: 'Existing List', createdAt: '', ...overrides };
}

const HEADER = 'Project,List,Quest,Task,Priority,Due Date,Description';

describe('ImportCsvModal', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('disables the file picker while offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    render(<ImportCsvModal onClose={vi.fn()} />);

    expect(screen.getByText(/You're offline/)).toBeInTheDocument();
    expect(screen.getByText('Choose CSV File')).toBeDisabled();
  });

  it('parses a CSV, shows a preview, and imports project → list → quest → subtask in order', async () => {
    useStore.setState({
      currentWorkspaceId: 'w1',
      projects: [],
      lists: [],
      addProject: vi.fn().mockResolvedValue('new-project-id'),
      addList: vi.fn().mockResolvedValue('new-list-id'),
      createTask: vi.fn().mockImplementation((listId, input) =>
        Promise.resolve(mockTask({ id: `id-${input.title}`, listId, parentTaskId: input.parentTaskId ?? null, title: input.title }))
      ),
    });

    render(<ImportCsvModal onClose={vi.fn()} />);

    const csv = [HEADER, 'New Project,New List,Scout the entrance,,high,,', ',,,Check gate stability,medium,,'].join(
      '\n'
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileWithText(csv)] } });

    expect(await screen.findByText('Start Import')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Start Import'));

    await waitFor(() => expect(screen.getByText(/quest.* created/i)).toBeInTheDocument());

    const { addProject, addList, createTask } = useStore.getState();
    expect(addProject).toHaveBeenCalledWith('New Project', null, 'E');
    expect(addList).toHaveBeenCalledWith('New List', 'new-project-id');
    expect(createTask).toHaveBeenNthCalledWith(1, 'new-list-id', {
      title: 'Scout the entrance',
      priority: 'high',
      dueDate: undefined,
      description: undefined,
    });
    expect(createTask).toHaveBeenNthCalledWith(2, 'new-list-id', {
      title: 'Check gate stability',
      priority: 'medium',
      dueDate: undefined,
      description: undefined,
      parentTaskId: 'id-Scout the entrance',
    });
  });

  it('reuses an existing project/list by case-insensitive name instead of creating a duplicate', async () => {
    const addProject = vi.fn();
    const addList = vi.fn();
    useStore.setState({
      currentWorkspaceId: 'w1',
      projects: [project({ id: 'existing-p', name: 'clear the red gate' })],
      lists: [list({ id: 'existing-l', projectId: 'existing-p', name: 'prep' })],
      addProject,
      addList,
      createTask: vi.fn().mockResolvedValue(mockTask({ id: 'q1' })),
    });

    render(<ImportCsvModal onClose={vi.fn()} />);
    const csv = [HEADER, 'Clear the Red Gate,Prep,Scout the entrance,,,,'].join('\n');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileWithText(csv)] } });

    await screen.findByText('Start Import');
    fireEvent.click(screen.getByText('Start Import'));

    await waitFor(() => expect(screen.getByText(/1 reused/)).toBeInTheDocument());
    expect(addProject).not.toHaveBeenCalled();
    expect(addList).not.toHaveBeenCalled();
    expect(useStore.getState().createTask).toHaveBeenCalledWith('existing-l', expect.objectContaining({ title: 'Scout the entrance' }));
  });

  it('keeps importing after a failed row and reports it in the summary', async () => {
    useStore.setState({
      currentWorkspaceId: 'w1',
      projects: [project({ id: 'existing-p', name: 'Project' })],
      lists: [list({ id: 'existing-l', projectId: 'existing-p', name: 'List' })],
      addProject: vi.fn(),
      addList: vi.fn(),
      createTask: vi
        .fn()
        .mockRejectedValueOnce(new ApiError(400, 'Title too long'))
        .mockResolvedValueOnce(mockTask({ id: 'q2', title: 'Second quest' })),
    });

    render(<ImportCsvModal onClose={vi.fn()} />);
    const csv = [HEADER, 'Project,List,First quest,,,,', ',,Second quest,,,,'].join('\n');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileWithText(csv)] } });

    await screen.findByText('Start Import');
    fireEvent.click(screen.getByText('Start Import'));

    await waitFor(() => expect(screen.getByText(/row\(s\) need attention/)).toBeInTheDocument());
    expect(screen.getByText(/Title too long/)).toBeInTheDocument();
    expect(useStore.getState().createTask).toHaveBeenCalledTimes(2);
  });

  it('shows a parse error and does not proceed when required columns are missing', async () => {
    useStore.setState({ createTask: vi.fn() });
    render(<ImportCsvModal onClose={vi.fn()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileWithText('Quest,Task\nDo it,')] } });

    expect(await screen.findByText(/must have "Project" and "List"/)).toBeInTheDocument();
    expect(screen.queryByText('Start Import')).not.toBeInTheDocument();
  });

  it('downloads the template CSV via a Blob when clicked', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ImportCsvModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Download Template'));

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
