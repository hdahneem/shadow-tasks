import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SearchView } from './SearchView';
import { useStore } from '../store/useStore';
import { searchApi, savedSearchesApi } from '../api/services';
import type { Task, SearchResults, SavedSearch } from '../types';

vi.mock('../api/services', () => ({
  searchApi: { run: vi.fn() },
  savedSearchesApi: { list: vi.fn(), create: vi.fn(), remove: vi.fn() },
}));

function baseTask(overrides: Partial<Task>): Task {
  return {
    id: 't1',
    listId: 'l1',
    parentTaskId: null,
    title: 'Untitled',
    priority: 'medium',
    done: false,
    position: 0,
    createdAt: '',
    updatedAt: '',
    progress: 0,
    ...overrides,
  };
}

function emptyResults(): SearchResults {
  return { tasks: [], comments: [], docs: [] };
}

function renderSearch() {
  return render(
    <MemoryRouter>
      <SearchView />
    </MemoryRouter>
  );
}

describe('SearchView', () => {
  beforeEach(() => {
    useStore.setState({
      projects: [
        { id: 'p1', workspaceId: 'w1', folderId: null, name: 'Gate Raid', rank: 'C', createdAt: '', effectiveRole: 'admin' },
      ],
    });
    vi.mocked(searchApi.run).mockResolvedValue(emptyResults());
    vi.mocked(savedSearchesApi.list).mockResolvedValue([]);
    vi.mocked(savedSearchesApi.create).mockImplementation(async (data) => ({
      id: 'ss1',
      userId: 'u1',
      name: data.name,
      query: data.query ?? null,
      filters: data.filters ?? null,
      createdAt: '',
    }));
    vi.mocked(savedSearchesApi.remove).mockResolvedValue(undefined);
  });

  it('shows a prompt and does not search when no criteria are set', () => {
    renderSearch();
    expect(screen.getByText('Type a query or set a filter to search your quests.')).toBeInTheDocument();
    expect(searchApi.run).not.toHaveBeenCalled();
  });

  it('runs a search and renders matching tasks and comments', async () => {
    vi.mocked(searchApi.run).mockResolvedValue({
      tasks: [baseTask({ id: 't1', title: 'Slay the ice elves', list: { id: 'l1', name: 'Main', project: { id: 'p1', name: 'Gate Raid' } } })],
      comments: [
        {
          id: 'c1',
          body: 'Watch out for the frost golem',
          createdAt: '',
          editedAt: null,
          author: { id: 'u1', name: 'Sung' },
          task: { id: 't2', title: 'Clear the gate', list: { id: 'l1', name: 'Main', project: { id: 'p1', name: 'Gate Raid' } } },
        },
      ],
      docs: [],
    });

    renderSearch();
    fireEvent.change(screen.getByPlaceholderText('Search quests, comments, and docs…'), { target: { value: 'frost' } });

    await waitFor(() => expect(searchApi.run).toHaveBeenCalledWith(expect.objectContaining({ q: 'frost' })));
    expect(await screen.findByText('Slay the ice elves')).toBeInTheDocument();
    expect(await screen.findByText(/frost golem/)).toBeInTheDocument();
    expect(screen.getByText('Clear the gate')).toBeInTheDocument();
  });

  it('renders matching docs, linked to the doc editor', async () => {
    vi.mocked(searchApi.run).mockResolvedValue({
      tasks: [],
      comments: [],
      docs: [
        {
          id: 'd1',
          title: 'Raid Strategy Notes',
          content: 'Bring the enchanted shield to the frost golem fight',
          updatedAt: '',
          workspace: { id: 'w1', name: "Lim Tae-Gyu's Workspace" },
        },
      ],
    });

    renderSearch();
    fireEvent.change(screen.getByPlaceholderText('Search quests, comments, and docs…'), { target: { value: 'enchanted' } });

    await waitFor(() => expect(searchApi.run).toHaveBeenCalledWith(expect.objectContaining({ q: 'enchanted' })));
    expect(await screen.findByText('Raid Strategy Notes')).toBeInTheDocument();
    expect(screen.getByText(/enchanted shield/)).toBeInTheDocument();
    const link = screen.getByText('Raid Strategy Notes').closest('a');
    expect(link).toHaveAttribute('href', '/docs/d1');
  });

  it('strips HTML tags from the doc content snippet', async () => {
    vi.mocked(searchApi.run).mockResolvedValue({
      tasks: [],
      comments: [],
      docs: [
        {
          id: 'd1',
          title: 'Rules',
          content: '<p><strong>Gather 5 hunters</strong> before entering the Red Gate.</p>',
          updatedAt: '',
          workspace: { id: 'w1', name: 'My Workspace' },
        },
      ],
    });

    renderSearch();
    fireEvent.change(screen.getByPlaceholderText('Search quests, comments, and docs…'), { target: { value: 'gather' } });

    expect(await screen.findByText(/Gather 5 hunters before entering the Red Gate\./)).toBeInTheDocument();
    expect(screen.queryByText(/<strong>/)).not.toBeInTheDocument();
    expect(screen.queryByText(/<p>/)).not.toBeInTheDocument();
  });

  it('shows an empty state for docs when none match', async () => {
    vi.mocked(searchApi.run).mockResolvedValue({ tasks: [], comments: [], docs: [] });

    renderSearch();
    fireEvent.change(screen.getByPlaceholderText('Search quests, comments, and docs…'), { target: { value: 'nothing' } });

    expect(await screen.findByText('No matching docs.')).toBeInTheDocument();
  });

  it('includes filter values in the search query', async () => {
    renderSearch();
    fireEvent.change(screen.getByPlaceholderText('Search quests, comments, and docs…'), { target: { value: 'gate' } });
    fireEvent.change(screen.getByDisplayValue('Any priority'), { target: { value: 'high' } });

    await waitFor(() =>
      expect(searchApi.run).toHaveBeenCalledWith(expect.objectContaining({ q: 'gate', priority: 'high' }))
    );
  });

  it('saves the current search and lists it', async () => {
    renderSearch();
    fireEvent.change(screen.getByPlaceholderText('Search quests, comments, and docs…'), { target: { value: 'gate' } });

    const saveBtn = await screen.findByText('Save this search');
    fireEvent.click(saveBtn);

    const nameInput = screen.getByPlaceholderText('Name this search…');
    fireEvent.change(nameInput, { target: { value: 'Gate quests' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() =>
      expect(savedSearchesApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Gate quests', query: 'gate' })
      )
    );
    expect(await screen.findByText('Gate quests')).toBeInTheDocument();
  });

  it('applies a saved search on click and deletes it on ✕', async () => {
    const saved: SavedSearch = {
      id: 'ss1',
      userId: 'u1',
      name: 'High priority gates',
      query: 'gate',
      filters: { priority: 'high' },
      createdAt: '',
    };
    vi.mocked(savedSearchesApi.list).mockResolvedValue([saved]);

    renderSearch();
    const chip = await screen.findByText('High priority gates');
    fireEvent.click(chip);

    await waitFor(() =>
      expect(searchApi.run).toHaveBeenCalledWith(expect.objectContaining({ q: 'gate', priority: 'high' }))
    );
    expect(screen.getByPlaceholderText('Search quests, comments, and docs…')).toHaveValue('gate');

    fireEvent.click(screen.getByText('✕'));
    await waitFor(() => expect(savedSearchesApi.remove).toHaveBeenCalledWith('ss1'));
    expect(screen.queryByText('High priority gates')).not.toBeInTheDocument();
  });
});
