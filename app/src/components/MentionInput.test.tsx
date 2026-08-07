import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { MentionInput, type MentionCandidate } from './MentionInput';

const MEMBERS: MentionCandidate[] = [
  { id: 'u1', name: 'Sung Jin-Woo' },
  { id: 'u2', name: 'Cha Hae-In' },
  { id: 'u3', name: 'Sung Il-Hwan' },
];

function Wrapper({ onChangeSpy }: { onChangeSpy?: (v: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <MentionInput
      value={value}
      onChange={(v) => {
        setValue(v);
        onChangeSpy?.(v);
      }}
      members={MEMBERS}
      placeholder="Add a comment..."
      className="hud-input"
    />
  );
}

function typeInto(input: HTMLElement, text: string) {
  fireEvent.change(input, { target: { value: text, selectionStart: text.length } });
}

describe('MentionInput', () => {
  it('shows no dropdown for plain text', () => {
    render(<Wrapper />);
    const input = screen.getByPlaceholderText('Add a comment...');
    typeInto(input, 'hello there');
    expect(screen.queryByRole('button', { name: /Sung/ })).not.toBeInTheDocument();
  });

  it('opens a dropdown of matching members when typing @', () => {
    render(<Wrapper />);
    const input = screen.getByPlaceholderText('Add a comment...');
    typeInto(input, 'hey @s');
    expect(screen.getByRole('button', { name: 'Sung Jin-Woo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sung Il-Hwan' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cha Hae-In' })).not.toBeInTheDocument();
  });

  it('does not treat a mid-word @ (like an email) as a mention trigger', () => {
    render(<Wrapper />);
    const input = screen.getByPlaceholderText('Add a comment...');
    typeInto(input, 'contact me@sung');
    expect(screen.queryByRole('button', { name: /Sung/ })).not.toBeInTheDocument();
  });

  it('inserts only the first name on click, followed by a space', () => {
    render(<Wrapper />);
    const input = screen.getByPlaceholderText('Add a comment...') as HTMLInputElement;
    typeInto(input, 'hey @s');
    input.focus();
    input.setSelectionRange(6, 6);
    // the option listens for mousedown (not click) so it can preventDefault and keep
    // the input focused/selected — matches how the component is actually used
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Sung Jin-Woo' }));
    expect(input.value).toBe('hey @Sung ');
  });

  it('supports arrow-key navigation and Enter to select', () => {
    render(<Wrapper />);
    const input = screen.getByPlaceholderText('Add a comment...') as HTMLInputElement;
    typeInto(input, '@s');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('@Sung ');
  });

  it('closes the dropdown on Escape without inserting anything', () => {
    render(<Wrapper />);
    const input = screen.getByPlaceholderText('Add a comment...') as HTMLInputElement;
    typeInto(input, '@s');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: /Sung/ })).not.toBeInTheDocument();
    expect(input.value).toBe('@s');
  });

  it('lets Enter submit normally (e.g. a surrounding form) when no dropdown is open', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Wrapper />
      </form>
    );
    const input = screen.getByPlaceholderText('Add a comment...');
    typeInto(input, 'no mention here');
    fireEvent.submit(input.closest('form')!);
    expect(onSubmit).toHaveBeenCalled();
  });
});
