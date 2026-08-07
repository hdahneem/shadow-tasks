import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ForgotPassword } from './ForgotPassword';
import { useAuthStore } from '../store/useAuthStore';

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPassword />
    </MemoryRouter>
  );
}

describe('ForgotPassword', () => {
  beforeEach(() => {
    useAuthStore.setState({ forgotPassword: vi.fn().mockResolvedValue(undefined) });
  });

  it('submits the entered email and shows a confirmation message', async () => {
    const forgotPassword = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ forgotPassword });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('hunter@association.gov'), {
      target: { value: 'sung@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    await waitFor(() => expect(forgotPassword).toHaveBeenCalledWith('sung@example.com'));
    expect(await screen.findByText(/reset link has/)).toBeInTheDocument();
    expect(screen.getByText('sung@example.com')).toBeInTheDocument();
  });

  it('shows an error and stays on the form if the request fails', async () => {
    useAuthStore.setState({ forgotPassword: vi.fn().mockRejectedValue(new Error('network down')) });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('hunter@association.gov'), {
      target: { value: 'sung@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Reset Link' })).toBeInTheDocument();
  });

  it('links back to sign in', () => {
    renderPage();
    expect(screen.getByRole('link', { name: '← Back to Sign In' })).toHaveAttribute('href', '/login');
  });
});
