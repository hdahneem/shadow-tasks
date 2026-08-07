import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PublicTaskView } from './PublicTaskView';
import { publicApi } from '../api/services';
import { ApiError } from '../api/client';
import type { PublicTask } from '../types';

vi.mock('../api/services', () => ({
  publicApi: { getTask: vi.fn() },
}));

function publicTask(overrides: Partial<PublicTask>): PublicTask {
  return {
    id: 't1',
    title: 'Clear the gate',
    description: null,
    priority: 'high',
    done: false,
    status: { name: 'In Progress', color: '#22d3ee', isCompleted: false },
    startDate: null,
    dueDate: '2026-08-06T00:00:00.000Z',
    progress: 40,
    projectName: 'Red Gate Raid',
    listName: 'Preparation',
    subtasks: [],
    comments: [],
    ...overrides,
  };
}

function renderView(token = 'abc123') {
  return render(
    <MemoryRouter initialEntries={[`/share/${token}`]}>
      <Routes>
        <Route path="/share/:token" element={<PublicTaskView />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PublicTaskView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the shared task with status, priority, due date, and progress', async () => {
    vi.mocked(publicApi.getTask).mockResolvedValue(publicTask({}));
    renderView();

    expect(await screen.findByText('Clear the gate')).toBeInTheDocument();
    expect(screen.getByText('Red Gate Raid / Preparation')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('high priority')).toBeInTheDocument();
    expect(screen.getByText('40% complete')).toBeInTheDocument();
    expect(publicApi.getTask).toHaveBeenCalledWith('abc123');
  });

  it('shows an invalid-link message when the token is not found', async () => {
    vi.mocked(publicApi.getTask).mockRejectedValue(new ApiError(404, 'This link is invalid or has been revoked'));
    renderView();

    expect(await screen.findByText('This link is invalid or has been revoked.')).toBeInTheDocument();
  });

  it('renders the description as HTML', async () => {
    vi.mocked(publicApi.getTask).mockResolvedValue(publicTask({ description: '<p>Gather hunters first</p>' }));
    renderView();

    await waitFor(() => expect(screen.getByText('Gather hunters first')).toBeInTheDocument());
  });

  it('renders nested subtasks', async () => {
    vi.mocked(publicApi.getTask).mockResolvedValue(
      publicTask({
        subtasks: [
          {
            id: 's1',
            parentTaskId: 't1',
            title: 'Scout ahead',
            done: true,
            priority: 'medium',
            dueDate: null,
            position: 0,
            progress: 100,
            children: [
              {
                id: 's2',
                parentTaskId: 's1',
                title: 'Check the perimeter',
                done: false,
                priority: 'low',
                dueDate: null,
                position: 0,
                progress: 0,
                children: [],
              },
            ],
          },
        ],
      })
    );
    renderView();

    expect(await screen.findByText(/Scout ahead/)).toBeInTheDocument();
    expect(screen.getByText(/Check the perimeter/)).toBeInTheDocument();
  });

  it('renders comments with author and body', async () => {
    vi.mocked(publicApi.getTask).mockResolvedValue(
      publicTask({ comments: [{ authorName: 'Cha Hae-In', body: 'Looks good to go', createdAt: '2026-08-05T00:00:00.000Z' }] })
    );
    renderView();

    expect(await screen.findByText('Cha Hae-In')).toBeInTheDocument();
    expect(screen.getByText('Looks good to go')).toBeInTheDocument();
  });
});
