import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ManageMembersModal } from './ManageMembersModal';
import { useStore } from '../store/useStore';
import { useAuthStore } from '../store/useAuthStore';
import { workspacesApi } from '../api/services';
import type { WorkspaceMember } from '../types';

vi.mock('../api/services', () => ({
  workspacesApi: {
    members: vi.fn(),
    invites: vi.fn(),
    invite: vi.fn(),
    changeMemberRole: vi.fn(),
    removeMember: vi.fn(),
    revokeInvite: vi.fn(),
  },
}));

function member(overrides: Partial<WorkspaceMember>): WorkspaceMember {
  return {
    id: 'm1',
    role: 'member',
    createdAt: '',
    user: { id: 'u2', name: 'Cha Hae-In', email: 'chae@example.com' },
    ...overrides,
  };
}

describe('ManageMembersModal', () => {
  beforeEach(() => {
    vi.mocked(workspacesApi.members).mockResolvedValue([
      member({ id: 'm1', role: 'owner', user: { id: 'u1', name: 'Sung Jin-Woo', email: 'sung@example.com' } }),
      member({ id: 'm2', role: 'member' }),
    ]);
    vi.mocked(workspacesApi.invites).mockResolvedValue([]);
    useAuthStore.setState({ user: { id: 'u1', name: 'Sung Jin-Woo', email: 'sung@example.com' } });
  });

  it('shows editable roles and an invite form for an admin', async () => {
    useStore.setState({
      workspaces: [{ id: 'w1', name: 'Guild Hall', ownerId: 'u1', role: 'owner', createdAt: '' }],
    });

    render(<ManageMembersModal workspaceId="w1" onClose={vi.fn()} />);

    expect(await screen.findByText('Cha Hae-In')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('email@example.com')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
  });

  it('shows read-only roles and no invite form for a non-admin member', async () => {
    useStore.setState({
      workspaces: [{ id: 'w1', name: 'Guild Hall', ownerId: 'u1', role: 'member', createdAt: '' }],
    });
    useAuthStore.setState({ user: { id: 'u2', name: 'Cha Hae-In', email: 'chae@example.com' } });

    render(<ManageMembersModal workspaceId="w1" onClose={vi.fn()} />);

    expect(await screen.findByText('Sung Jin-Woo')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('email@example.com')).not.toBeInTheDocument();
    expect(screen.getByText('owner')).toBeInTheDocument();
  });

  it('lets an admin invite a new member', async () => {
    useStore.setState({
      workspaces: [{ id: 'w1', name: 'Guild Hall', ownerId: 'u1', role: 'admin', createdAt: '' }],
    });
    vi.mocked(workspacesApi.invite).mockResolvedValue({
      id: 'inv1',
      workspaceId: 'w1',
      email: 'new@example.com',
      role: 'member',
      invitedById: 'u1',
      createdAt: '',
      acceptedAt: null,
      autoAccepted: false,
    });

    render(<ManageMembersModal workspaceId="w1" onClose={vi.fn()} />);
    await screen.findByText('Cha Hae-In');

    fireEvent.change(screen.getByPlaceholderText('email@example.com'), { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByText('Invite'));

    await waitFor(() => expect(workspacesApi.invite).toHaveBeenCalledWith('w1', 'new@example.com', 'member'));
  });

  it('lets an admin change a member role', async () => {
    useStore.setState({
      workspaces: [{ id: 'w1', name: 'Guild Hall', ownerId: 'u1', role: 'owner', createdAt: '' }],
    });
    vi.mocked(workspacesApi.changeMemberRole).mockResolvedValue(member({}));

    render(<ManageMembersModal workspaceId="w1" onClose={vi.fn()} />);
    await screen.findByText('Cha Hae-In');

    const roleSelects = screen.getAllByRole('combobox');
    fireEvent.change(roleSelects[1], { target: { value: 'admin' } });

    await waitFor(() => expect(workspacesApi.changeMemberRole).toHaveBeenCalledWith('w1', 'u2', 'admin'));
  });
});
