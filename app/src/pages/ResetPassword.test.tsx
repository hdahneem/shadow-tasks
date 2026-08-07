import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ResetPassword } from './ResetPassword';
import { useAuthStore } from '../store/useAuthStore';

function renderPage(search = '?token=abc123') {
  return render(
    <MemoryRouter initialEntries={[`/reset-password${search}`]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ResetPassword', () => {
  it('shows an error state when the link has no token', () => {
    renderPage('');
    expect(screen.getByText(/missing its reset token/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset Password' })).not.toBeInTheDocument();
  });

  it('validates the new password length before submitting', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));
    expect(await screen.findByText('New password must be at least 8 characters.')).toBeInTheDocument();
  });

  it('validates that the confirmation matches', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'longenough1' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'different1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));
    expect(await screen.findByText('New password and confirmation do not match.')).toBeInTheDocument();
  });

  it('submits the token and new password, then shows a success state that links to sign in', async () => {
    const resetPassword = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ resetPassword });
    renderPage('?token=abc123');

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'longenough1' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'longenough1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith('abc123', 'longenough1'));
    expect(await screen.findByText('Your password has been reset.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });

  it('shows an error for an invalid or expired token', async () => {
    useAuthStore.setState({ resetPassword: vi.fn().mockRejectedValue(new Error('invalid')) });
    renderPage();

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'longenough1' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'longenough1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
  });
});
