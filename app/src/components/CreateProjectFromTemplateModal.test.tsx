import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateProjectFromTemplateModal } from './CreateProjectFromTemplateModal';
import { useStore } from '../store/useStore';
import { projectTemplatesApi } from '../api/services';
import type { ProjectTemplate } from '../types';

vi.mock('../api/services', () => ({
  projectTemplatesApi: { list: vi.fn() },
}));

function template(overrides: Partial<ProjectTemplate>): ProjectTemplate {
  return {
    id: 't1',
    userId: 'u1',
    name: 'Dungeon Raid Template',
    statuses: [],
    fields: [],
    listNames: ['Preparation'],
    createdAt: '',
    ...overrides,
  };
}

describe('CreateProjectFromTemplateModal', () => {
  beforeEach(() => {
    useStore.setState({
      folders: [{ id: 'f1', workspaceId: 'w1', name: 'Dungeon Raids', color: '#22d3ee', createdAt: '' }],
    });
  });

  it('shows an empty state when there are no saved templates', async () => {
    vi.mocked(projectTemplatesApi.list).mockResolvedValue([]);
    render(<CreateProjectFromTemplateModal folderId={null} onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(await screen.findByText(/No saved templates yet/)).toBeInTheDocument();
  });

  it('creates a project from the selected template and reports the new id', async () => {
    vi.mocked(projectTemplatesApi.list).mockResolvedValue([template({})]);
    const createProjectFromTemplate = vi.fn().mockResolvedValue('p-new');
    useStore.setState({ createProjectFromTemplate });
    const onCreated = vi.fn();

    render(<CreateProjectFromTemplateModal folderId={null} onClose={vi.fn()} onCreated={onCreated} />);

    expect(await screen.findByText('Dungeon Raid Template')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('e.g. Clear the Blue Gate'), {
      target: { value: 'Clear the Blue Gate' },
    });
    fireEvent.click(screen.getByText('Create Project'));

    await waitFor(() =>
      expect(createProjectFromTemplate).toHaveBeenCalledWith('t1', 'Clear the Blue Gate', null, 'E')
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('p-new'));
  });
});
