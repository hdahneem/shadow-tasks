import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PullToRefresh } from './PullToRefresh';
import { useStore } from '../store/useStore';

// fireEvent's return value is the DOM dispatchEvent result: false means
// preventDefault() was called on that event, true means it wasn't (or the
// event isn't cancelable) — the direct signal for "did this move hijack the
// browser's native scroll".
function touch(el: Element, type: 'touchStart' | 'touchMove' | 'touchEnd', clientX: number, clientY: number) {
  return fireEvent[type](el, { touches: [{ clientX, clientY }] });
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
    const moveResult = touch(main, 'touchMove', 100, 250); // 200px raw drag -> 100px visual, past the 44px release threshold
    touch(main, 'touchEnd', 100, 250);

    // an active pull calls preventDefault — dispatchEvent returns false when it does
    expect(moveResult).toBe(false);
    await waitFor(() => expect(useStore.getState().triggerSync).toHaveBeenCalledWith(true));
  });

  it('does not hijack scrolling when the container reaches the top via native momentum mid-touch', () => {
    // Regression: scrolling UP is physically the same downward drag as pulling
    // to refresh. A touch that starts mid-list (not at the top) must never
    // retroactively become a pull just because native scrolling carried it to
    // scrollTop 0 while the finger kept moving — that's what made ordinary
    // upward scrolling get stuck.
    render(
      <PullToRefresh>
        <p>content</p>
      </PullToRefresh>
    );
    const main = screen.getByRole('main');
    Object.defineProperty(main, 'scrollTop', { value: 50, configurable: true, writable: true });

    touch(main, 'touchStart', 100, 200); // starts mid-list, not a pull candidate
    (main as unknown as { scrollTop: number }).scrollTop = 0; // native scroll carries it to the top mid-drag
    const moveResult = touch(main, 'touchMove', 100, 400); // finger keeps moving down
    touch(main, 'touchEnd', 100, 400);

    // native scrolling was never blocked for this touch
    expect(moveResult).toBe(true);
    expect(useStore.getState().triggerSync).not.toHaveBeenCalled();
  });

  it('releases control back to native scrolling when the drag reverses, instead of staying hijacked', () => {
    // Regression: engaging must be re-derived every move, not latched — a
    // one-way "engaged" flag kept preventDefault firing for the rest of the
    // touch even after the user reversed direction, which is the other half
    // of the "scrolling gets stuck" bug.
    render(
      <PullToRefresh>
        <p>content</p>
      </PullToRefresh>
    );
    const main = screen.getByRole('main');
    Object.defineProperty(main, 'scrollTop', { value: 0, configurable: true });

    touch(main, 'touchStart', 100, 50);
    touch(main, 'touchMove', 100, 100); // pulling down 50px raw -> engaged, below release threshold
    const reversedResult = touch(main, 'touchMove', 100, 40); // reverses back above the start point
    touch(main, 'touchEnd', 100, 40);

    // once reversed, this move is handed back to native scrolling
    expect(reversedResult).toBe(true);
    expect(useStore.getState().triggerSync).not.toHaveBeenCalled();
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
    const moveResult = touch(main, 'touchMove', 260, 60); // mostly horizontal
    touch(main, 'touchEnd', 260, 60);

    expect(moveResult).toBe(true); // never hijacked — the Kanban board's own horizontal scroll still works
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
    const moveResult = touch(main, 'touchMove', 100, 250);
    touch(main, 'touchEnd', 100, 250);

    expect(moveResult).toBe(true); // never hijacked — normal scrolling continues
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
