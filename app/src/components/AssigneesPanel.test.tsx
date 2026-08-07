import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AssigneesPanel } from './AssigneesPanel';
import { assigneesApi, workspacesApi } from '../api/services';
import { ApiError } from '../api/client';
import type { Task, WorkspaceMember } from '../types';

vi.mock('../api/services', () => ({
  assigneesApi: { add: vi.fn(), remove: vi.fn() },
  workspacesApi: { members: vi.fn() },
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
    assignees: [],
    ...overrides,
  };
}

function member(id: string, name: string): WorkspaceMember {
  return { id: `m-${id}`, role: 'member', createdAt: '', user: { id, name, email: `${id}@example.com` } };
}

describe('AssigneesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(workspacesApi.members).mockResolvedValue([member('u1', 'Cha Hae-In'), member('u2', 'Baek Yoonho')]);
  });

  it('shows "Unassigned." when there are no assignees', () => {
    render(<AssigneesPanel task={baseTask({})} onChanged={vi.fn()} />);
    expect(screen.getByText('Unassigned.')).toBeInTheDocument();
  });

  it('renders each assignee with their name', () => {
    render(
      <AssigneesPanel
        task={baseTask({ assignees: [{ id: 'u1', name: 'Cha Hae-In' }] })}
        onChanged={vi.fn()}
      />
    );
    expect(screen.getByText('Cha Hae-In')).toBeInTheDocument();
    expect(screen.queryByText('Unassigned.')).not.toBeInTheDocument();
  });

  it('offers workspace members as candidates, excluding those already assigned', async () => {
    render(
      <AssigneesPanel
        task={baseTask({ assignees: [{ id: 'u1', name: 'Cha Hae-In' }] })}
        onChanged={vi.fn()}
      />
    );
    await waitFor(() => expect(workspacesApi.members).toHaveBeenCalledWith('w1'));

    fireEvent.click(screen.getByText('+ Assign'));
    const select = screen.getByText('Select a hunter…').closest('select')!;
    expect(within(select).queryByText('Cha Hae-In')).not.toBeInTheDocument();
    expect(within(select).getByText('Baek Yoonho')).toBeInTheDocument();
  });

  it('assigns the selected hunter and reports the change', async () => {
    vi.mocked(assigneesApi.add).mockResolvedValue({ id: 'u2', name: 'Baek Yoonho' });
    const onChanged = vi.fn();
    render(<AssigneesPanel task={baseTask({})} onChanged={onChanged} />);
    await waitFor(() => expect(workspacesApi.members).toHaveBeenCalled());

    fireEvent.click(screen.getByText('+ Assign'));
    fireEvent.change(screen.getByText('Select a hunter…').closest('select')!, { target: { value: 'u2' } });
    fireEvent.click(screen.getByText('Assign'));

    await waitFor(() => expect(assigneesApi.add).toHaveBeenCalledWith('t-main', 'u2'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('shows a server error when assigning fails', async () => {
    vi.mocked(assigneesApi.add).mockRejectedValue(new ApiError(409, 'That hunter is already assigned to this quest'));
    render(<AssigneesPanel task={baseTask({})} onChanged={vi.fn()} />);
    await waitFor(() => expect(workspacesApi.members).toHaveBeenCalled());

    fireEvent.click(screen.getByText('+ Assign'));
    fireEvent.change(screen.getByText('Select a hunter…').closest('select')!, { target: { value: 'u1' } });
    fireEvent.click(screen.getByText('Assign'));

    expect(await screen.findByText('That hunter is already assigned to this quest')).toBeInTheDocument();
  });

  it('unassigns a hunter and reports the change', async () => {
    vi.mocked(assigneesApi.remove).mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(
      <AssigneesPanel task={baseTask({ assignees: [{ id: 'u1', name: 'Cha Hae-In' }] })} onChanged={onChanged} />
    );

    fireEvent.click(screen.getByLabelText('Unassign Cha Hae-In'));

    await waitFor(() => expect(assigneesApi.remove).toHaveBeenCalledWith('t-main', 'u1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
