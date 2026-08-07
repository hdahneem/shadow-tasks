import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsModal } from './SettingsModal';
import { useAuthStore, type Session } from '../store/useAuthStore';
import { ApiError } from '../api/client';

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    device: 'Chrome on macOS',
    createdAt: '2026-08-05T00:00:00.000Z',
    current: false,
    ...overrides,
  };
}

describe('SettingsModal', () => {
  beforeEach(() => {
    useAuthStore.setState({
      listSessions: vi.fn().mockResolvedValue([]),
      revokeSession: vi.fn().mockResolvedValue(undefined),
      revokeOtherSessions: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('pre-fills the name field with the current user name', () => {
    useAuthStore.setState({ user: { id: 'u1', email: 'hunter@example.com', name: 'Sung Jin-Woo' } });
    render(<SettingsModal onClose={vi.fn()} />);
    expect(screen.getByDisplayValue('Sung Jin-Woo')).toBeInTheDocument();
  });

  it('saves an updated display name', async () => {
    useAuthStore.setState({ user: { id: 'u1', email: 'hunter@example.com', name: 'Sung Jin-Woo' } });
    const updateName = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ updateName });
    render(<SettingsModal onClose={vi.fn()} />);

    const input = screen.getByDisplayValue('Sung Jin-Woo');
    fireEvent.change(input, { target: { value: 'Shadow Monarch' } });
    fireEvent.click(screen.getByText('Save Name'));

    await waitFor(() => expect(updateName).toHaveBeenCalledWith('Shadow Monarch'));
    expect(await screen.findByText('Name updated.')).toBeInTheDocument();
  });

  it('shows an error when the name update fails', async () => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'hunter@example.com', name: 'Sung Jin-Woo' },
      updateName: vi.fn().mockRejectedValue(new Error('fail')),
    });
    render(<SettingsModal onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('Save Name'));
    expect(await screen.findByText('Could not update your name. Please try again.')).toBeInTheDocument();
  });

  it('changes the password when the form is valid', async () => {
    const changePassword = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({
      user: { id: 'u1', email: 'hunter@example.com', name: 'Sung Jin-Woo' },
      changePassword,
    });
    render(<SettingsModal onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Current password'), { target: { value: 'old-pass123' } });
    fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value: 'new-pass456' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm new password'), { target: { value: 'new-pass456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith('old-pass123', 'new-pass456'));
    expect(await screen.findByText('Password changed.')).toBeInTheDocument();
  });

  it('rejects a new password shorter than 8 characters without calling the API', () => {
    const changePassword = vi.fn();
    useAuthStore.setState({ user: { id: 'u1', email: 'hunter@example.com', name: 'Sung Jin-Woo' }, changePassword });
    render(<SettingsModal onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Current password'), { target: { value: 'old-pass123' } });
    fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value: 'short' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm new password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(screen.getByText('New password must be at least 8 characters.')).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('rejects mismatched confirmation without calling the API', () => {
    const changePassword = vi.fn();
    useAuthStore.setState({ user: { id: 'u1', email: 'hunter@example.com', name: 'Sung Jin-Woo' }, changePassword });
    render(<SettingsModal onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Current password'), { target: { value: 'old-pass123' } });
    fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value: 'new-pass456' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm new password'), { target: { value: 'different789' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(screen.getByText('New password and confirmation do not match.')).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('shows a specific error when the current password is wrong (401)', async () => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'hunter@example.com', name: 'Sung Jin-Woo' },
      changePassword: vi.fn().mockRejectedValue(new ApiError(401, 'Current password is incorrect')),
    });
    render(<SettingsModal onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Current password'), { target: { value: 'wrong-pass' } });
    fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value: 'new-pass456' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm new password'), { target: { value: 'new-pass456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument();
  });

  it('hides the delete confirmation form until Delete Account is clicked', () => {
    useAuthStore.setState({ user: { id: 'u1', email: 'hunter@example.com', name: 'Sung Jin-Woo' } });
    render(<SettingsModal onClose={vi.fn()} />);

    expect(screen.queryByPlaceholderText('Your password')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Delete Account'));
    expect(screen.getByPlaceholderText('Your password')).toBeInTheDocument();
  });

  it('keeps the delete button disabled until DELETE is typed exactly', () => {
    useAuthStore.setState({ user: { id: 'u1', email: 'hunter@example.com', name: 'Sung Jin-Woo' } });
    render(<SettingsModal onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('Delete Account'));
    fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'password123' } });
    const confirmButton = screen.getByRole('button', { name: 'Permanently Delete' });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'delete' } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } });
    expect(confirmButton).not.toBeDisabled();
  });

  it('deletes the account when confirmed', async () => {
    const deleteAccount = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ user: { id: 'u1', email: 'hunter@example.com', name: 'Sung Jin-Woo' }, deleteAccount });
    render(<SettingsModal onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('Delete Account'));
    fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Permanently Delete' }));

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith('password123'));
  });

  it('surfaces the shared-workspace conflict message from the server', async () => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'hunter@example.com', name: 'Sung Jin-Woo' },
      deleteAccount: vi
        .fn()
        .mockRejectedValue(new ApiError(409, 'You own workspace(s) with other members: Raid Squad')),
    });
    render(<SettingsModal onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('Delete Account'));
    fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Permanently Delete' }));

    expect(await screen.findByText('You own workspace(s) with other members: Raid Squad')).toBeInTheDocument();
  });

  it('cancels back to the collapsed state and clears any entered values', () => {
    useAuthStore.setState({ user: { id: 'u1', email: 'hunter@example.com', name: 'Sung Jin-Woo' } });
    render(<SettingsModal onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('Delete Account'));
    fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.queryByPlaceholderText('Your password')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Delete Account'));
    expect(screen.getByPlaceholderText('Your password')).toHaveValue('');
  });

  it('lists active sessions with a badge on the current device', async () => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'hunter@example.com', name: 'Sung Jin-Woo' },
      listSessions: vi.fn().mockResolvedValue([
        session({ id: 's1', device: 'Chrome on macOS', current: true }),
        session({ id: 's2', device: 'Safari on iOS', current: false }),
      ]),
    });
    render(<SettingsModal onClose={vi.fn()} />);

    expect(await screen.findByText('Chrome on macOS')).toBeInTheDocument();
    expect(screen.getByText('Safari on iOS')).toBeInTheDocument();
    expect(screen.getByText('This device')).toBeInTheDocument();
  });

  it('only shows "Sign Out Other Devices" when there is more than one session', async () => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'hunter@example.com', name: 'Sung Jin-Woo' },
      listSessions: vi.fn().mockResolvedValue([session({ id: 's1', current: true })]),
    });
    render(<SettingsModal onClose={vi.fn()} />);

    await screen.findByText('Chrome on macOS');
    expect(screen.queryByText('Sign Out Other Devices')).not.toBeInTheDocument();
  });

  it('revokes a non-current session without confirmation', async () => {
    const revokeSession = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({
      user: { id: 'u1', email: 'hunter@example.com', name: 'Sung Jin-Woo' },
      listSessions: vi.fn().mockResolvedValue([
        session({ id: 's1', device: 'Chrome on macOS', current: true }),
        session({ id: 's2', device: 'Safari on iOS', current: false }),
      ]),
      revokeSession,
    });
    render(<SettingsModal onClose={vi.fn()} />);

    await screen.findByText('Safari on iOS');
    const revokeButtons = screen.getAllByText('Revoke');
    fireEvent.click(revokeButtons[1]);

    await waitFor(() => expect(revokeSession).toHaveBeenCalledWith('s2'));
  });

  it('confirms before revoking the current session, then logs out', async () => {
    const revokeSession = vi.fn().mockResolvedValue(undefined);
    const logout = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    useAuthStore.setState({
      user: { id: 'u1', email: 'hunter@example.com', name: 'Sung Jin-Woo' },
      listSessions: vi.fn().mockResolvedValue([session({ id: 's1', current: true })]),
      revokeSession,
      logout,
    });
    render(<SettingsModal onClose={vi.fn()} />);

    await screen.findByText('Chrome on macOS');
    fireEvent.click(screen.getByText('Revoke'));

    await waitFor(() => expect(revokeSession).toHaveBeenCalledWith('s1'));
    await waitFor(() => expect(logout).toHaveBeenCalled());
  });

  it('signs out other devices after confirming', async () => {
    const revokeOtherSessions = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    useAuthStore.setState({
      user: { id: 'u1', email: 'hunter@example.com', name: 'Sung Jin-Woo' },
      listSessions: vi.fn().mockResolvedValue([
        session({ id: 's1', current: true }),
        session({ id: 's2', current: false }),
      ]),
      revokeOtherSessions,
    });
    render(<SettingsModal onClose={vi.fn()} />);

    await screen.findByText('Sign Out Other Devices');
    fireEvent.click(screen.getByText('Sign Out Other Devices'));

    await waitFor(() => expect(revokeOtherSessions).toHaveBeenCalled());
  });
});
