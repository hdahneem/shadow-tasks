import { useLayoutEffect, useRef, useState } from 'react';

export interface MentionCandidate {
  id: string;
  name: string;
}

/**
 * Finds the "@partial" token immediately before the cursor, if any. Only the
 * first word of a member's name is ever inserted — the backend's mention
 * parser matches on first name only, so the autocomplete must produce exactly
 * what it expects to reliably trigger a notification.
 */
function activeMentionToken(value: string, cursor: number): { start: number; query: string } | null {
  const uptoCursor = value.slice(0, cursor);
  const match = uptoCursor.match(/(?:^|\s)@(\w*)$/);
  if (!match) return null;
  const start = cursor - match[1].length - 1;
  return { start, query: match[1] };
}

export function MentionInput({
  value,
  onChange,
  members,
  placeholder,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  members: MentionCandidate[];
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState<{ start: number; query: string } | null>(null);
  const [highlight, setHighlight] = useState(0);
  const pendingCursorRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pendingCursorRef.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(pendingCursorRef.current, pendingCursorRef.current);
      pendingCursorRef.current = null;
    }
  }, [value]);

  const matches = token
    ? members.filter((m) => m.name.split(' ')[0].toLowerCase().startsWith(token.query.toLowerCase())).slice(0, 6)
    : [];
  const open = token !== null && matches.length > 0;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    const cursor = e.target.selectionStart ?? e.target.value.length;
    setToken(activeMentionToken(e.target.value, cursor));
    setHighlight(0);
  };

  const selectMember = (member: MentionCandidate) => {
    if (!token) return;
    const firstName = member.name.split(' ')[0];
    const cursor = inputRef.current?.selectionStart ?? value.length;
    const inserted = `@${firstName} `;
    const nextValue = value.slice(0, token.start) + inserted + value.slice(cursor);
    pendingCursorRef.current = token.start + inserted.length;
    onChange(nextValue);
    setToken(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      selectMember(matches[highlight]);
    } else if (e.key === 'Escape') {
      setToken(null);
    }
  };

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setToken(null)}
        placeholder={placeholder}
        className={className}
      />
      {open && (
        <ul className="absolute z-10 bottom-full mb-1 left-0 w-56 max-h-48 overflow-y-auto hud-panel py-1">
          {matches.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectMember(m);
                }}
                className={`w-full text-left px-3 py-1.5 text-sm cursor-pointer ${
                  i === highlight ? 'bg-cyan-dim/20 text-cyan-bright' : 'text-mist hover:bg-cyan-dim/10'
                }`}
              >
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
