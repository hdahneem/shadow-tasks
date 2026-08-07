import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { useStore } from '../store/useStore';
import { workspacesApi } from '../api/services';

vi.mock('../api/services', () => ({
  workspacesApi: {
    members: vi.fn().mockResolvedValue([]),
    invites: vi.fn().mockResolvedValue([]),
  },
}));

describe('WorkspaceSwitcher', () => {
  beforeEach(() => {
    useStore.setState({
      workspaces: [
        { id: 'w1', name: 'Personal', ownerId: 'u1', role: 'owner', createdAt: '' },
        { id: 'w2', name: 'Guild Hall', ownerId: 'u1', role: 'admin', createdAt: '' },
      ],
      currentWorkspaceId: 'w1',
    });
  });

  it('lists all workspaces and switches the active one', () => {
    const setCurrentWorkspace = vi.fn();
    useStore.setState({ setCurrentWorkspace });
    render(<WorkspaceSwitcher />);

    const select = screen.getByLabelText('Active workspace') as HTMLSelectElement;
    expect(select.value).toBe('w1');
    expect(screen.getByText('Guild Hall')).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'w2' } });
    expect(setCurrentWorkspace).toHaveBeenCalledWith('w2');
  });

  it('opens the create-workspace modal', () => {
    render(<WorkspaceSwitcher />);
    fireEvent.click(screen.getByTitle('New workspace'));
    expect(screen.getByText('New Workspace')).toBeInTheDocument();
  });

  it('opens the manage-members modal for the active workspace', async () => {
    render(<WorkspaceSwitcher />);
    fireEvent.click(screen.getByTitle('Manage workspace members'));
    expect(await screen.findByText('Manage Workspace')).toBeInTheDocument();
    expect(workspacesApi.members).toHaveBeenCalledWith('w1');
  });
});
