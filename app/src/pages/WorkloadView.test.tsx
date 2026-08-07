import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkloadView } from './WorkloadView';
import { useStore } from '../store/useStore';
import { workspacesApi } from '../api/services';
import type { WorkloadEntry } from '../types';

vi.mock('../api/services', () => ({
  workspacesApi: { workload: vi.fn() },
}));

function entry(overrides: Partial<WorkloadEntry>): WorkloadEntry {
  return {
    userId: 'u1',
    name: 'Sung Jin-Woo',
    totalTasks: 3,
    openTasks: 2,
    doneTasks: 1,
    overdueTasks: 0,
    estimatedMinutes: 0,
    actualMinutes: 0,
    ...overrides,
  };
}

function renderView() {
  return render(
    <MemoryRouter>
      <WorkloadView />
    </MemoryRouter>
  );
}

describe('WorkloadView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ currentWorkspaceId: 'w1' });
  });

  it('shows an empty state when the workspace has no members', async () => {
    vi.mocked(workspacesApi.workload).mockResolvedValue([]);
    renderView();
    expect(await screen.findByText('No members in this workspace.')).toBeInTheDocument();
    expect(workspacesApi.workload).toHaveBeenCalledWith('w1');
  });

  it('renders each member with their open/done counts', async () => {
    vi.mocked(workspacesApi.workload).mockResolvedValue([
      entry({ userId: 'u1', name: 'Sung Jin-Woo', openTasks: 4, doneTasks: 2 }),
      entry({ userId: 'u2', name: 'Cha Hae-In', openTasks: 1, doneTasks: 5 }),
    ]);
    renderView();

    expect(await screen.findByText('Sung Jin-Woo')).toBeInTheDocument();
    expect(screen.getByText('Cha Hae-In')).toBeInTheDocument();
    expect(screen.getByText('4 open')).toBeInTheDocument();
    expect(screen.getByText('1 open')).toBeInTheDocument();
    expect(screen.getByText('5 done')).toBeInTheDocument();
  });

  it('sorts members by open task count, most loaded first', async () => {
    vi.mocked(workspacesApi.workload).mockResolvedValue([
      entry({ userId: 'u1', name: 'Light Load', openTasks: 1 }),
      entry({ userId: 'u2', name: 'Heavy Load', openTasks: 9 }),
    ]);
    renderView();

    const names = (await screen.findAllByText(/Load$/)).map((el) => el.textContent);
    expect(names).toEqual(['Heavy Load', 'Light Load']);
  });

  it('flags overdue tasks distinctly', async () => {
    vi.mocked(workspacesApi.workload).mockResolvedValue([entry({ overdueTasks: 3 })]);
    renderView();
    expect(await screen.findByText('3 overdue')).toBeInTheDocument();
  });

  it('formats estimated minutes as hours and minutes', async () => {
    vi.mocked(workspacesApi.workload).mockResolvedValue([entry({ estimatedMinutes: 90 })]);
    renderView();
    expect(await screen.findByText('1h 30m est.')).toBeInTheDocument();
  });
});
