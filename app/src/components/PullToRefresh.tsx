import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store/useStore';
import { toVisualPull, shouldEngage, isReadyToRelease, MAX_VISUAL_PULL } from '../lib/pullToRefresh';

/**
 * Wraps the app's main scroll region with a manual pull-to-refresh gesture.
 * Touch-only by construction (mouse input never fires touch events), so it
 * costs nothing on desktop — the click-to-sync affordance on SyncStatusIndicator
 * covers that case instead.
 *
 * Two rules keep this from ever hijacking a normal scroll (see the "gets stuck"
 * regression this fixed):
 *   1. A touch is only a pull *candidate* if the container is already at
 *      scrollTop 0 the moment the finger lands (touchstart). Scrolling UP and
 *      arriving at the top mid-gesture via native momentum must NOT retroactively
 *      turn into a pull — physically it's the same downward drag, so without this
 *      a normal "scroll to the top" gesture would get hijacked partway through.
 *   2. Within a candidate touch, whether the CURRENT move counts as "pulling" is
 *      re-derived fresh every event (shouldEngage), not latched by a one-way
 *      "engaged" flag. That way reversing direction mid-drag (or the list itself
 *      scrolling) immediately hands control back to native scrolling instead of
 *      staying hijacked for the rest of the touch.
 *
 * Uses a native (non-React) touchmove listener registered with
 * { passive: false } — React's synthetic touch handlers are attached passively
 * at the root, so calling preventDefault() from an onTouchMove prop doesn't
 * reliably stop the browser's own scroll/overscroll on all WebViews.
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const syncingRef = useRef(false);
  const [visualPull, setVisualPull] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const runSync = async () => {
      syncingRef.current = true;
      setSyncing(true);
      // triggerSync never rejects — a failure is reflected via syncState, which
      // SyncStatusIndicator surfaces, so there's nothing conditional to do here.
      await useStore.getState().triggerSync(true);
      syncingRef.current = false;
      setSyncing(false);
      setVisualPull(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (syncingRef.current || el.scrollTop > 0) {
        startRef.current = null;
        return;
      }
      const t = e.touches[0];
      startRef.current = { x: t.clientX, y: t.clientY };
      draggingRef.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (syncingRef.current || !startRef.current) return;
      const t = e.touches[0];
      const deltaX = t.clientX - startRef.current.x;
      const deltaY = t.clientY - startRef.current.y;

      if (!shouldEngage(deltaX, deltaY, el.scrollTop)) {
        // Not an active pull right now (reversed direction, went horizontal, or
        // the list scrolled away from the top) — release control back to the
        // browser instead of continuing to hijack this touch.
        setVisualPull(0);
        return;
      }
      e.preventDefault();
      setVisualPull(toVisualPull(deltaY));
    };

    const onTouchEnd = () => {
      const wasCandidate = startRef.current !== null;
      startRef.current = null;
      draggingRef.current = false;
      if (!wasCandidate) return;
      setVisualPull((current) => {
        if (isReadyToRelease(current)) {
          void runSync();
          return MAX_VISUAL_PULL * 0.6;
        }
        return 0;
      });
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  const ready = isReadyToRelease(visualPull);

  return (
    <main ref={containerRef} className="flex-1 overflow-y-auto relative">
      <div
        className="flex items-center justify-center gap-2 overflow-hidden font-body text-[11px] uppercase tracking-wider text-cyan-bright"
        style={{ height: visualPull, transition: draggingRef.current ? 'none' : 'height 200ms ease-out' }}
        aria-live="polite"
      >
        {visualPull > 0 && (syncing ? <span className="animate-glow-pulse">Syncing…</span> : <span>{ready ? '↑ Release to sync' : '↓ Pull to sync'}</span>)}
      </div>
      {children}
    </main>
  );
}
