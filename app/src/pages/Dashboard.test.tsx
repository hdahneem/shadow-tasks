import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Dashboard } from './Dashboard';
import { useStore } from '../store/useStore';
import { BADGES } from '../lib/badges';

function renderView() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/badges" element={<div>Badges Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Dashboard badges preview', () => {
  beforeEach(() => {
    useStore.setState({
      hunter: { level: 1, xp: 0, tasksCompleted: 0, highestLevel: 1 },
      tasks: [],
      projects: [],
    });
  });

  it('previews every badge on the status window', () => {
    renderView();
    for (const badge of BADGES) {
      expect(screen.getByAltText(badge.name)).toBeInTheDocument();
    }
  });

  it('links through to the full badges page', () => {
    renderView();
    expect(screen.getByRole('button', { name: 'View Badges' })).toBeInTheDocument();
  });

  it('navigates to /badges when clicked', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'View Badges' }));
    expect(screen.getByText('Badges Page')).toBeInTheDocument();
  });
});
