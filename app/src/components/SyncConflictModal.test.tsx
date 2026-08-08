import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SyncConflictModal } from './SyncConflictModal';

describe('SyncConflictModal', () => {
  it('shows both timestamps and calls the right handler for each choice', () => {
    const onKeepPhone = vi.fn();
    const onKeepDesktop = vi.fn();
    const onClose = vi.fn();

    render(
      <SyncConflictModal
        localChangedAt={new Date('2026-08-07T10:00:00.000Z').getTime()}
        serverChangedAt="2026-08-07T12:00:00.000Z"
        busy={false}
        onKeepPhone={onKeepPhone}
        onKeepDesktop={onKeepDesktop}
        onClose={onClose}
      />
    );

    expect(screen.getByText('Sync Conflict')).toBeInTheDocument();

    fireEvent.click(screen.getByText("Keep this phone's changes"));
    expect(onKeepPhone).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Keep desktop's version"));
    expect(onKeepDesktop).toHaveBeenCalled();
  });

  it('disables both action buttons while busy', () => {
    render(
      <SyncConflictModal
        localChangedAt={Date.now()}
        serverChangedAt={null}
        busy={true}
        onKeepPhone={vi.fn()}
        onKeepDesktop={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const buttons = screen.getAllByText('Syncing…');
    expect(buttons).toHaveLength(2);
    buttons.forEach((b) => expect(b.closest('button')).toBeDisabled());
  });
});
