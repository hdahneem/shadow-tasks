import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { useStore } from '../store/useStore';

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

describe('SyncStatusIndicator', () => {
  beforeEach(() => {
    setOnline(true);
    // A freshly-injected mock via setState, rather than vi.spyOn — spying on
    // the same store action across tests reuses one spy and its call history
    // instead of resetting it, since useStore.getState() keeps returning the
    // same underlying function reference across zustand's shallow-merged state.
    useStore.setState({ syncState: 'idle', pendingOps: [], triggerSync: vi.fn().mockResolvedValue(undefined) });
  });

  it('shows Synced when online, idle, and nothing pending', () => {
    render(<SyncStatusIndicator />);
    expect(screen.getByText('Synced')).toBeInTheDocument();
  });

  it('shows Syncing while a sync is in flight', () => {
    useStore.setState({ syncState: 'syncing' });
    render(<SyncStatusIndicator />);
    expect(screen.getByText('Syncing…')).toBeInTheDocument();
  });

  it('shows Syncing when idle but changes are still queued', () => {
    useStore.setState({
      syncState: 'idle',
      pendingOps: [{ id: 'op1', kind: 'toggleDone', taskId: 't1', done: true, createdAt: 1 }],
    });
    render(<SyncStatusIndicator />);
    expect(screen.getByText('Syncing…')).toBeInTheDocument();
  });

  it('shows Offline regardless of syncState when the browser is offline', () => {
    setOnline(false);
    useStore.setState({ syncState: 'error' });
    render(<SyncStatusIndicator />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('shows Sync Failed when online and the last sync errored', () => {
    useStore.setState({ syncState: 'error' });
    render(<SyncStatusIndicator />);
    expect(screen.getByText('Sync Failed')).toBeInTheDocument();
  });

  it('triggers a forced manual sync when clicked while idle', () => {
    render(<SyncStatusIndicator />);
    fireEvent.click(screen.getByRole('button'));
    expect(useStore.getState().triggerSync).toHaveBeenCalledWith(true);
  });

  it('triggers a manual sync when clicked after a failure (retry)', () => {
    useStore.setState({ syncState: 'error' });
    render(<SyncStatusIndicator />);
    fireEvent.click(screen.getByRole('button'));
    expect(useStore.getState().triggerSync).toHaveBeenCalledWith(true);
  });

  it('does not trigger a sync when clicked while offline', () => {
    setOnline(false);
    render(<SyncStatusIndicator />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(useStore.getState().triggerSync).not.toHaveBeenCalled();
  });

  it('does not trigger a second sync when clicked while already syncing', () => {
    useStore.setState({ syncState: 'syncing' });
    render(<SyncStatusIndicator />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(useStore.getState().triggerSync).not.toHaveBeenCalled();
  });
});
