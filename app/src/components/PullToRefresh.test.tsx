import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PullToRefresh } from './PullToRefresh';
import { useStore } from '../store/useStore';

function touch(el: Element, type: 'touchStart' | 'touchMove' | 'touchEnd', clientX: number, clientY: number) {
  fireEvent[type](el, { touches: [{ clientX, clientY }] });
}

describe('PullToRefresh', () => {
  beforeEach(() => {
    // A freshly-injected mock via setState, rather than vi.spyOn — spying on
    // the same store action across tests reuses one spy and its call history
    // instead of resetting it, since useStore.getState() keeps returning the
    // same underlying function reference across zustand's shallow-merged state.
    useStore.setState({ triggerSync: vi.fn().mockResolvedValue(undefined) });
  });

  it('renders its children', () => {
    render(
      <PullToRefresh>
        <p>Quest Log</p>
      </PullToRefresh>
    );
    expect(screen.getByText('Quest Log')).toBeInTheDocument();
  });

  it('triggers a forced sync when pulled down past the release threshold from the top', async () => {
    render(
      <PullToRefresh>
        <p>content</p>
      </PullToRefresh>
    );
    const main = screen.getByRole('main');
    Object.defineProperty(main, 'scrollTop', { value: 0, configurable: true });

    touch(main, 'touchStart', 100, 50);
    touch(main, 'touchMove', 100, 250); // 200px raw drag -> 100px visual, past the 44px release threshold
    touch(main, 'touchEnd', 100, 250);

    await waitFor(() => expect(useStore.getState().triggerSync).toHaveBeenCalledWith(true));
  });

  it('does not sync when released before the threshold', () => {
    render(
      <PullToRefresh>
        <p>content</p>
      </PullToRefresh>
    );
    const main = screen.getByRole('main');
    Object.defineProperty(main, 'scrollTop', { value: 0, configurable: true });

    touch(main, 'touchStart', 100, 50);
    touch(main, 'touchMove', 100, 60); // 10px raw drag -> 5px visual, well short of release
    touch(main, 'touchEnd', 100, 60);

    expect(useStore.getState().triggerSync).not.toHaveBeenCalled();
  });

  it('does not sync for a horizontal swipe (e.g. dragging the Kanban board)', () => {
    render(
      <PullToRefresh>
        <p>content</p>
      </PullToRefresh>
    );
    const main = screen.getByRole('main');
    Object.defineProperty(main, 'scrollTop', { value: 0, configurable: true });

    touch(main, 'touchStart', 100, 50);
    touch(main, 'touchMove', 260, 60); // mostly horizontal
    touch(main, 'touchEnd', 260, 60);

    expect(useStore.getState().triggerSync).not.toHaveBeenCalled();
  });

  it('does not sync when the container is already scrolled down', () => {
    render(
      <PullToRefresh>
        <p>content</p>
      </PullToRefresh>
    );
    const main = screen.getByRole('main');
    Object.defineProperty(main, 'scrollTop', { value: 200, configurable: true });

    touch(main, 'touchStart', 100, 50);
    touch(main, 'touchMove', 100, 250);
    touch(main, 'touchEnd', 100, 250);

    expect(useStore.getState().triggerSync).not.toHaveBeenCalled();
  });

  it('shows a syncing label while the triggered sync is in flight', async () => {
    let resolveSync: () => void;
    useStore.setState({
      triggerSync: vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveSync = () => resolve(undefined);
        })
      ),
    });

    render(
      <PullToRefresh>
        <p>content</p>
      </PullToRefresh>
    );
    const main = screen.getByRole('main');
    Object.defineProperty(main, 'scrollTop', { value: 0, configurable: true });

    touch(main, 'touchStart', 100, 50);
    touch(main, 'touchMove', 100, 250);
    touch(main, 'touchEnd', 100, 250);

    expect(await screen.findByText('Syncing…')).toBeInTheDocument();
    resolveSync!();
  });
});
