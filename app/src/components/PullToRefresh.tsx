import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store/useStore';
import { toVisualPull, shouldEngage, isReadyToRelease, MAX_VISUAL_PULL } from '../lib/pullToRefresh';

/**
 * Wraps the app's main scroll region with a manual pull-to-refresh gesture.
 * Touch-only by construction (mouse input never fires touch events), so it
 * costs nothing on desktop — the click-to-sync affordance on SyncStatusIndicator
 * covers that case instead. Only engages a drag that starts at the very top of
 * the scroll container and is predominantly vertical, so it never steals a
 * horizontal swipe (e.g. the Kanban board) or interferes with scrolling once
 * you're not at the top — see shouldEngage in lib/pullToRefresh.ts.
 *
 * Uses a native (non-React) touchmove listener registered with
 * { passive: false } — React's synthetic touch handlers are attached passively
 * at the root, so calling preventDefault() from an onTouchMove prop doesn't
 * reliably stop the browser's own scroll/overscroll on all WebViews.
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const engagedRef = useRef(false);
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
      if (syncingRef.current) return;
      const t = e.touches[0];
      startRef.current = { x: t.clientX, y: t.clientY };
      engagedRef.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (syncingRef.current || !startRef.current) return;
      const t = e.touches[0];
      const deltaX = t.clientX - startRef.current.x;
      const deltaY = t.clientY - startRef.current.y;

      if (!engagedRef.current) {
        if (!shouldEngage(deltaX, deltaY, el.scrollTop)) return;
        engagedRef.current = true;
      }
      e.preventDefault();
      setVisualPull(toVisualPull(deltaY));
    };

    const onTouchEnd = () => {
      startRef.current = null;
      if (!engagedRef.current) return;
      engagedRef.current = false;
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
        style={{ height: visualPull, transition: engagedRef.current ? 'none' : 'height 200ms ease-out' }}
        aria-live="polite"
      >
        {visualPull > 0 && (syncing ? <span className="animate-glow-pulse">Syncing…</span> : <span>{ready ? '↑ Release to sync' : '↓ Pull to sync'}</span>)}
      </div>
      {children}
    </main>
  );
}
