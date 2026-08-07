import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { ToastContainer } from './ToastContainer';
import { useToastStore, toast } from '../store/useToastStore';

describe('ToastContainer', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it('renders nothing when there are no toasts', () => {
    const { container } = render(<ToastContainer />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a pushed toast message', () => {
    render(<ToastContainer />);
    act(() => toast.error('Could not delete quest.'));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not delete quest.');
  });

  it('renders multiple toasts stacked, oldest first', () => {
    render(<ToastContainer />);
    act(() => {
      toast.error('first error');
      toast.success('second success');
    });

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveTextContent('first error');
    expect(alerts[1]).toHaveTextContent('second success');
  });

  it('dismisses a toast when its close button is clicked', () => {
    render(<ToastContainer />);
    act(() => toast.error('Could not delete quest.'));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Dismiss notification'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  describe('auto-dismiss', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('automatically removes a toast after the timeout elapses', () => {
      render(<ToastContainer />);
      act(() => toast.error('Could not delete quest.'));
      expect(screen.getByRole('alert')).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(5000));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('does not remove a toast before the timeout elapses', () => {
      render(<ToastContainer />);
      act(() => toast.error('Could not delete quest.'));

      act(() => vi.advanceTimersByTime(4000));
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
