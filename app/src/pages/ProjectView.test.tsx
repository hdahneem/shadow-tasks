import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProjectView } from './ProjectView';
import { useStore } from '../store/useStore';
import type { Project, WorkspaceRole } from '../types';

function project(effectiveRole: WorkspaceRole): Project {
  return {
    id: 'p1',
    workspaceId: 'w1',
    folderId: null,
    name: 'Clear the Red Gate',
    rank: 'D',
    createdAt: '',
    effectiveRole,
  };
}

function renderProjectView() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1']}>
      <Routes>
        <Route path="/projects/:projectId" element={<ProjectView />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProjectView admin gating (via effectiveRole, not workspace role)', () => {
  it('shows admin-only controls when the project effective role is admin, even if the workspace role is lower', () => {
    useStore.setState({
      projects: [project('admin')],
      lists: [],
      tasks: [],
      workspaces: [{ id: 'w1', name: 'Guild Hall', ownerId: 'someone-else', role: 'viewer', createdAt: '' }],
    });

    renderProjectView();

    expect(screen.getByRole('button', { name: 'Statuses' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fields' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Automations' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Access' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('hides admin-only controls when the project effective role is viewer, even if the workspace role is admin', () => {
    useStore.setState({
      projects: [project('viewer')],
      lists: [],
      tasks: [],
      workspaces: [{ id: 'w1', name: 'Guild Hall', ownerId: 'someone-else', role: 'admin', createdAt: '' }],
    });

    renderProjectView();

    expect(screen.queryByRole('button', { name: 'Statuses' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fields' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Automations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Access' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    // "+ Add List" form requires member+, also hidden for a viewer
    expect(screen.queryByPlaceholderText('New list name...')).not.toBeInTheDocument();
  });

  it('always shows the Board/Table/Timeline view switcher regardless of role', () => {
    useStore.setState({
      projects: [project('viewer')],
      lists: [],
      tasks: [],
      workspaces: [],
    });

    renderProjectView();

    expect(screen.getByRole('button', { name: 'Board' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Table' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timeline' })).toBeInTheDocument();
  });

  it('shows a not-found message for an unknown project', () => {
    useStore.setState({ projects: [], lists: [], tasks: [], workspaces: [] });
    renderProjectView();
    expect(screen.getByText('Project not found.')).toBeInTheDocument();
  });
});
