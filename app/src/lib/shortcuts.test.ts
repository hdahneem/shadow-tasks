import { describe, it, expect } from 'vitest';
import { isTypingTarget, filterCommands, GO_SHORTCUTS, type Command } from './shortcuts';

describe('isTypingTarget', () => {
  it('returns true for input, textarea, and select elements', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
  });

  it('returns true for contenteditable elements', () => {
    const div = document.createElement('div');
    Object.defineProperty(div, 'isContentEditable', { value: true });
    expect(isTypingTarget(div)).toBe(true);
  });

  it('returns false for plain elements, null, and non-elements', () => {
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({} as EventTarget)).toBe(false);
  });
});

describe('filterCommands', () => {
  function cmd(overrides: Partial<Command>): Command {
    return { id: 'x', label: 'Untitled', group: 'Actions', run: () => {}, ...overrides };
  }

  const commands = [
    cmd({ id: '1', label: 'Go to Calendar', keywords: 'schedule' }),
    cmd({ id: '2', label: 'New Folder' }),
    cmd({ id: '3', label: 'Sign Out', keywords: 'logout' }),
  ];

  it('returns all commands for an empty or whitespace query', () => {
    expect(filterCommands(commands, '')).toHaveLength(3);
    expect(filterCommands(commands, '   ')).toHaveLength(3);
  });

  it('matches on label, case-insensitively', () => {
    expect(filterCommands(commands, 'calendar').map((c) => c.id)).toEqual(['1']);
    expect(filterCommands(commands, 'CALENDAR').map((c) => c.id)).toEqual(['1']);
  });

  it('matches on keywords even when the label does not match', () => {
    expect(filterCommands(commands, 'logout').map((c) => c.id)).toEqual(['3']);
    expect(filterCommands(commands, 'schedule').map((c) => c.id)).toEqual(['1']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterCommands(commands, 'xyz123')).toHaveLength(0);
  });
});

describe('GO_SHORTCUTS', () => {
  it('maps single-letter keys to their destination routes', () => {
    expect(GO_SHORTCUTS.h).toBe('/');
    expect(GO_SHORTCUTS.a).toBe('/all');
    expect(GO_SHORTCUTS.c).toBe('/calendar');
    expect(GO_SHORTCUTS.s).toBe('/search');
    expect(GO_SHORTCUTS.w).toBe('/workload');
    expect(GO_SHORTCUTS.b).toBe('/badges');
  });
});
