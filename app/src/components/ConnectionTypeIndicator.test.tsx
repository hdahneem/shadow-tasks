import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionTypeIndicator } from './ConnectionTypeIndicator';
import { useConnectionStore } from '../store/useConnectionStore';

const nativeMock = vi.hoisted(() => ({ isNative: true }));
vi.mock('../native', () => nativeMock);

describe('ConnectionTypeIndicator', () => {
  beforeEach(() => {
    nativeMock.isNative = true;
    useConnectionStore.setState({ connectionType: 'unknown', candidateCount: 2 });
  });

  it('renders nothing on non-native builds even with multiple candidates', () => {
    nativeMock.isNative = false;
    const { container } = render(<ConnectionTypeIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when only one backend candidate exists (no USB fallback configured)', () => {
    useConnectionStore.setState({ candidateCount: 1 });
    const { container } = render(<ConnectionTypeIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows Wi-Fi when the last successful request went over the primary candidate', () => {
    useConnectionStore.setState({ connectionType: 'wifi' });
    render(<ConnectionTypeIndicator />);
    expect(screen.getByLabelText('Connection type: Wi-Fi')).toBeInTheDocument();
  });

  it('shows USB when the last successful request went over the USB fallback', () => {
    useConnectionStore.setState({ connectionType: 'usb' });
    render(<ConnectionTypeIndicator />);
    expect(screen.getByLabelText('Connection type: USB')).toBeInTheDocument();
  });
});
