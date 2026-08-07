import { prisma } from '../lib/prisma.js';

/** A user may only have one timer running at a time, across every task. */
export async function getRunningEntryForUser(userId: string) {
  return prisma.timeEntry.findFirst({ where: { userId, endedAt: null } });
}

/** Running entries count toward the total using `now` as their provisional end, so the total ticks live. */
export function computeLoggedMinutes(
  entries: { startedAt: Date; endedAt: Date | null }[],
  now: Date = new Date()
): number {
  const totalMs = entries.reduce((sum, e) => sum + ((e.endedAt ?? now).getTime() - e.startedAt.getTime()), 0);
  return Math.round(totalMs / 60000);
}
