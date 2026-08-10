// Pure gesture math for the pull-to-refresh indicator — kept separate from the
// touch-event wiring in components/PullToRefresh.tsx so the thresholds and
// damping curve are unit-testable without simulating real touch events.

/** How much slower the indicator grows than the finger moves — a raw 200px drag reads as 100px of pull. */
export const RESISTANCE = 0.5;
/** Visual cap on how far the indicator can grow, however hard the user pulls. */
export const MAX_VISUAL_PULL = 64;
/** Visual pull distance (post-resistance) required to trigger a sync on release. */
export const RELEASE_THRESHOLD = 44;
/** Raw finger movement, in either axis, before a drag is considered a deliberate pull at all. */
export const ENGAGE_THRESHOLD = 8;

/** Damped, capped pull distance for a given raw vertical drag (0 for upward drags). */
export function toVisualPull(rawDeltaY: number): number {
  if (rawDeltaY <= 0) return 0;
  return Math.min(rawDeltaY * RESISTANCE, MAX_VISUAL_PULL);
}

/**
 * Whether a drag should be treated as a pull-to-refresh gesture rather than
 * normal scrolling or a horizontal swipe (e.g. the Kanban board). Requires:
 * the scroll container already at its top, a predominantly-downward drag past
 * a small dead zone, and more vertical than horizontal movement.
 */
export function shouldEngage(deltaX: number, deltaY: number, scrollTop: number): boolean {
  return scrollTop <= 0 && deltaY > ENGAGE_THRESHOLD && deltaY > Math.abs(deltaX);
}

/** Whether releasing now should trigger a sync. */
export function isReadyToRelease(visualPull: number): boolean {
  return visualPull >= RELEASE_THRESHOLD;
}
