import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('renders the correct fill width and rounded percentage label', () => {
    const { container } = render(<ProgressBar value={1} max={3} label="Quest Progress" />);
    const fill = container.querySelector('.hud-bar-fill') as HTMLElement;
    expect(fill.style.width).toBe(`${(1 / 3) * 100}%`);
    expect(screen.getByText('33%')).toBeInTheDocument();
    expect(screen.getByText('Quest Progress')).toBeInTheDocument();
  });

  it('clamps to 100% and never exceeds it', () => {
    const { container } = render(<ProgressBar value={9} max={3} />);
    const fill = container.querySelector('.hud-bar-fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('treats a zero max as 0% instead of dividing by zero', () => {
    const { container } = render(<ProgressBar value={0} max={0} />);
    const fill = container.querySelector('.hud-bar-fill') as HTMLElement;
    expect(fill.style.width).toBe('0%');
  });

  it('omits the label row when no label is given', () => {
    render(<ProgressBar value={1} max={2} />);
    expect(screen.queryByText('50%')).not.toBeInTheDocument();
  });
});
