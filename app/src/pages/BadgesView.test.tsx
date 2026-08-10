import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BadgesView } from './BadgesView';
import { useStore } from '../store/useStore';
import { BADGES } from '../lib/badges';

function renderView() {
  return render(
    <MemoryRouter>
      <BadgesView />
    </MemoryRouter>
  );
}

describe('BadgesView', () => {
  beforeEach(() => {
    useStore.setState({ hunter: { level: 1, xp: 0, tasksCompleted: 0, highestLevel: 1 } });
  });

  it('renders every badge with its name', () => {
    renderView();
    for (const badge of BADGES) {
      expect(screen.getByText(badge.name)).toBeInTheDocument();
    }
  });

  it('shows 0 / 8 unlocked at level 1', () => {
    renderView();
    expect(screen.getByText(/0 \/ 8 unlocked/)).toBeInTheDocument();
    expect(screen.getAllByText(/^Locked/)).toHaveLength(8);
  });

  it('unlocks badges up to the current highest level', () => {
    useStore.setState({ hunter: { level: 25, xp: 0, tasksCompleted: 0, highestLevel: 25 } });
    renderView();
    // D-Rank (10) and C-Rank (20) unlocked; B/A/S-Rank and the three prestige badges stay locked
    expect(screen.getByText(/2 \/ 8 unlocked/)).toBeInTheDocument();
    expect(screen.getByText(`Unlocked at Level ${BADGES[0].levelRequired}`)).toBeInTheDocument();
    expect(screen.getAllByText(/^Locked/)).toHaveLength(6);
  });

  it('keeps a badge unlocked based on highestLevel even if current level has since dropped', () => {
    useStore.setState({ hunter: { level: 5, xp: 0, tasksCompleted: 0, highestLevel: 40 } });
    renderView();
    // D/C/B/A-Rank (10/20/30/40) unlocked
    expect(screen.getByText(/4 \/ 8 unlocked/)).toBeInTheDocument();
  });

  it('unlocks every badge once the highest level reaches the top requirement', () => {
    useStore.setState({ hunter: { level: 100, xp: 0, tasksCompleted: 0, highestLevel: 100 } });
    renderView();
    expect(screen.getByText(/8 \/ 8 unlocked/)).toBeInTheDocument();
    expect(screen.queryByText(/^Locked/)).not.toBeInTheDocument();
  });
});
