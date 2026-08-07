import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateWorkspaceModal } from './CreateWorkspaceModal';
import { useStore } from '../store/useStore';

describe('CreateWorkspaceModal', () => {
  it('creates a workspace with the entered name and closes', async () => {
    const createWorkspace = vi.fn().mockResolvedValue('w-new');
    useStore.setState({ createWorkspace });
    const onClose = vi.fn();

    render(<CreateWorkspaceModal onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText('e.g. Hunter Association'), {
      target: { value: 'Guild Hall' },
    });
    fireEvent.click(screen.getByText('Create Workspace'));

    await waitFor(() => expect(createWorkspace).toHaveBeenCalledWith('Guild Hall'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('disables submit until a name is entered', () => {
    render(<CreateWorkspaceModal onClose={vi.fn()} />);
    expect(screen.getByText('Create Workspace')).toBeDisabled();
  });
});
