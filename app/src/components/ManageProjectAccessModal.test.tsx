import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ManageProjectAccessModal } from './ManageProjectAccessModal';
import { projectsApi } from '../api/services';
import type { ProjectMemberAccess } from '../types';

vi.mock('../api/services', () => ({
  projectsApi: {
    members: vi.fn(),
    setMemberRole: vi.fn(),
    removeMemberOverride: vi.fn(),
  },
}));

function accessRow(overrides: Partial<ProjectMemberAccess>): ProjectMemberAccess {
  return {
    userId: 'u2',
    user: { id: 'u2', name: 'Cha Hae-In', email: 'chae@example.com' },
    workspaceRole: 'member',
    overrideRole: null,
    effectiveRole: 'member',
    ...overrides,
  };
}

describe('ManageProjectAccessModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows every workspace member with their inherited role by default', async () => {
    vi.mocked(projectsApi.members).mockResolvedValue([
      accessRow({}),
      accessRow({ userId: 'u1', user: { id: 'u1', name: 'Sung Jin-Woo', email: 'sung@example.com' }, workspaceRole: 'owner', effectiveRole: 'owner' }),
    ]);

    render(<ManageProjectAccessModal projectId="p1" onClose={vi.fn()} />);

    expect(await screen.findByText('Cha Hae-In')).toBeInTheDocument();
    expect(screen.getByText('Sung Jin-Woo')).toBeInTheDocument();
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(selects[0].value).toBe('inherit');
  });

  it('shows the current override selected when one exists', async () => {
    vi.mocked(projectsApi.members).mockResolvedValue([accessRow({ overrideRole: 'admin', effectiveRole: 'admin' })]);

    render(<ManageProjectAccessModal projectId="p1" onClose={vi.fn()} />);
    await screen.findByText('Cha Hae-In');

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('admin');
  });

  it('sets an override when a specific role is chosen', async () => {
    vi.mocked(projectsApi.members).mockResolvedValue([accessRow({})]);
    vi.mocked(projectsApi.setMemberRole).mockResolvedValue({ userId: 'u2', overrideRole: 'admin', effectiveRole: 'admin' });

    render(<ManageProjectAccessModal projectId="p1" onClose={vi.fn()} />);
    await screen.findByText('Cha Hae-In');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'admin' } });

    await waitFor(() => expect(projectsApi.setMemberRole).toHaveBeenCalledWith('p1', 'u2', 'admin'));
  });

  it('removes the override when switching back to Inherit', async () => {
    vi.mocked(projectsApi.members).mockResolvedValue([accessRow({ overrideRole: 'admin', effectiveRole: 'admin' })]);
    vi.mocked(projectsApi.removeMemberOverride).mockResolvedValue(undefined);

    render(<ManageProjectAccessModal projectId="p1" onClose={vi.fn()} />);
    await screen.findByText('Cha Hae-In');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'inherit' } });

    await waitFor(() => expect(projectsApi.removeMemberOverride).toHaveBeenCalledWith('p1', 'u2'));
  });

  it('shows an error message if updating the override fails', async () => {
    vi.mocked(projectsApi.members).mockResolvedValue([accessRow({})]);
    vi.mocked(projectsApi.setMemberRole).mockRejectedValue(new Error('nope'));

    render(<ManageProjectAccessModal projectId="p1" onClose={vi.fn()} />);
    await screen.findByText('Cha Hae-In');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'viewer' } });

    expect(await screen.findByText(/Could not update/)).toBeInTheDocument();
  });

  it('shows an empty state when there are no workspace members', async () => {
    vi.mocked(projectsApi.members).mockResolvedValue([]);
    render(<ManageProjectAccessModal projectId="p1" onClose={vi.fn()} />);
    expect(await screen.findByText('No workspace members yet.')).toBeInTheDocument();
  });
});
