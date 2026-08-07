export interface Command {
  id: string;
  label: string;
  group: string;
  keywords?: string;
  run: () => void;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return Boolean(target.isContentEditable);
}

export function filterCommands(commands: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  return commands.filter((c) => `${c.label} ${c.keywords ?? ''}`.toLowerCase().includes(q));
}

export const GO_SHORTCUTS: Record<string, string> = {
  h: '/',
  a: '/all',
  c: '/calendar',
  s: '/search',
  r: '/archived',
  d: '/docs',
  v: '/activity',
  w: '/workload',
  b: '/badges',
};
