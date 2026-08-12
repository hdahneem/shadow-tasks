import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionTypeIndicator } from './ConnectionTypeIndicator';
import { useConnectionStore } from '../store/useConnectionStore';

const nativeMock = vi.hoisted(() => ({ isNative: true }));
vi.mock('../native', () => nativeMock);

describe('ConnectionTypeIndicator', () => {
  beforeEach(() => {
    nativeMock.isNative = true;
    useConnectionStore.setState({ connectionType: 'usb', candidateCount: 2 });
  });

  it('renders nothing on non-native builds even while connected via USB', () => {
    nativeMock.isNative = false;
    const { container } = render(<ConnectionTypeIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when only one backend candidate exists (no USB fallback configured)', () => {
    useConnectionStore.setState({ candidateCount: 1 });
    const { container } = render(<ConnectionTypeIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while connected over Wi-Fi', () => {
    useConnectionStore.setState({ connectionType: 'wifi' });
    const { container } = render(<ConnectionTypeIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the connection type is not yet known', () => {
    useConnectionStore.setState({ connectionType: 'unknown' });
    const { container } = render(<ConnectionTypeIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the USB indicator only once the request actually went over the USB fallback', () => {
    render(<ConnectionTypeIndicator />);
    expect(screen.getByLabelText('Connection type: USB')).toBeInTheDocument();
  });
});
