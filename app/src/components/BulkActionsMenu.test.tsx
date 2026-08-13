import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BulkActionsMenu } from './BulkActionsMenu';

describe('BulkActionsMenu', () => {
  it('shows items after opening and calls onSelect, closing the menu', () => {
    const onSelect = vi.fn();
    render(<BulkActionsMenu items={[{ key: 'a', label: 'Do Thing', onSelect }]} />);

    expect(screen.queryByText('Do Thing')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Actions ▾'));
    expect(screen.getByText('Do Thing')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Do Thing'));
    expect(onSelect).toHaveBeenCalled();
    expect(screen.queryByText('Do Thing')).not.toBeInTheDocument();
  });

  it('closes when clicking outside the menu', () => {
    render(
      <div>
        <BulkActionsMenu items={[{ key: 'a', label: 'Do Thing', onSelect: vi.fn() }]} />
        <button>Outside</button>
      </div>
    );

    fireEvent.click(screen.getByText('Actions ▾'));
    expect(screen.getByText('Do Thing')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText('Outside'));
    expect(screen.queryByText('Do Thing')).not.toBeInTheDocument();
  });

  it('does not invoke onSelect for a disabled item', () => {
    const onSelect = vi.fn();
    render(<BulkActionsMenu items={[{ key: 'a', label: 'Do Thing', onSelect, disabled: true }]} />);

    fireEvent.click(screen.getByText('Actions ▾'));
    fireEvent.click(screen.getByText('Do Thing'));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('disables the trigger while busy', () => {
    render(<BulkActionsMenu items={[]} busy />);
    expect(screen.getByText('Actions ▾')).toBeDisabled();
  });
});
