import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SharePanel } from './SharePanel';
import { shareApi } from '../api/services';
import type { Task } from '../types';

vi.mock('../api/services', () => ({
  shareApi: { enable: vi.fn(), revoke: vi.fn() },
}));

function task(overrides: Partial<Task>): Task {
  return {
    id: 't1',
    listId: 'l1',
    parentTaskId: null,
    title: 'Clear the gate',
    priority: 'medium',
    done: false,
    position: 0,
    createdAt: '',
    updatedAt: '',
    progress: 0,
    shareToken: null,
    ...overrides,
  };
}

describe('SharePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('shows the disabled state when not shared', () => {
    render(<SharePanel task={task({})} onChanged={vi.fn()} />);
    expect(screen.getByText('Not shared publicly.')).toBeInTheDocument();
    expect(screen.getByText('+ Enable Public Link')).toBeInTheDocument();
  });

  it('enables sharing and reports the change', async () => {
    vi.mocked(shareApi.enable).mockResolvedValue({ shareToken: 'abc123' });
    const onChanged = vi.fn();
    render(<SharePanel task={task({})} onChanged={onChanged} />);

    fireEvent.click(screen.getByText('+ Enable Public Link'));

    await waitFor(() => expect(shareApi.enable).toHaveBeenCalledWith('t1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('shows the share link with copy and revoke controls once shared', () => {
    render(<SharePanel task={task({ shareToken: 'abc123' })} onChanged={vi.fn()} />);
    const input = screen.getByLabelText('Public share link') as HTMLInputElement;
    expect(input.value).toContain('/share/abc123');
    expect(screen.getByText('Copy')).toBeInTheDocument();
    expect(screen.getByText('Revoke link')).toBeInTheDocument();
  });

  it('copies the share link to the clipboard', async () => {
    render(<SharePanel task={task({ shareToken: 'abc123' })} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByText('Copy'));

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/share/abc123')));
    expect(await screen.findByText('Copied!')).toBeInTheDocument();
  });

  it('revokes the link after confirmation and reports the change', async () => {
    vi.mocked(shareApi.revoke).mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onChanged = vi.fn();
    render(<SharePanel task={task({ shareToken: 'abc123' })} onChanged={onChanged} />);

    fireEvent.click(screen.getByText('Revoke link'));

    await waitFor(() => expect(shareApi.revoke).toHaveBeenCalledWith('t1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('does not revoke when confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<SharePanel task={task({ shareToken: 'abc123' })} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByText('Revoke link'));

    expect(shareApi.revoke).not.toHaveBeenCalled();
  });
});
