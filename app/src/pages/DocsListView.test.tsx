import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DocsListView } from './DocsListView';
import { useStore } from '../store/useStore';
import { docsApi } from '../api/services';
import type { DocSummary } from '../types';

vi.mock('../api/services', () => ({
  docsApi: { list: vi.fn(), create: vi.fn(), remove: vi.fn() },
}));

function docSummary(overrides: Partial<DocSummary>): DocSummary {
  return {
    id: 'd1',
    workspaceId: 'w1',
    title: 'Raid Plan',
    authorName: 'Baek Yoonho',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={['/docs']}>
      <Routes>
        <Route path="/docs" element={<DocsListView />} />
        <Route path="/docs/:docId" element={<div>Doc Editor Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('DocsListView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ currentWorkspaceId: 'w1' });
  });

  it('shows an empty state when there are no docs', async () => {
    vi.mocked(docsApi.list).mockResolvedValue([]);
    renderView();
    expect(await screen.findByText('No docs yet. Start one above.')).toBeInTheDocument();
  });

  it('renders docs with author and updated date', async () => {
    vi.mocked(docsApi.list).mockResolvedValue([docSummary({})]);
    renderView();
    expect(await screen.findByText('Raid Plan')).toBeInTheDocument();
    expect(screen.getByText(/Baek Yoonho/)).toBeInTheDocument();
  });

  it('creates a doc and navigates to it', async () => {
    vi.mocked(docsApi.list).mockResolvedValue([]);
    vi.mocked(docsApi.create).mockResolvedValue({ ...docSummary({ id: 'new1' }), content: '' });
    renderView();
    await screen.findByText('No docs yet. Start one above.');

    fireEvent.click(screen.getByText('+ New Doc'));
    fireEvent.change(screen.getByPlaceholderText('Doc title…'), { target: { value: 'Meeting Notes' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(docsApi.create).toHaveBeenCalledWith('w1', 'Meeting Notes'));
    expect(await screen.findByText('Doc Editor Page')).toBeInTheDocument();
  });

  it('deletes a doc after confirmation', async () => {
    vi.mocked(docsApi.list).mockResolvedValue([docSummary({})]);
    vi.mocked(docsApi.remove).mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderView();
    await screen.findByText('Raid Plan');

    fireEvent.click(screen.getByTitle('Delete doc'));

    await waitFor(() => expect(docsApi.remove).toHaveBeenCalledWith('d1'));
  });

  it('does not delete when confirmation is cancelled', async () => {
    vi.mocked(docsApi.list).mockResolvedValue([docSummary({})]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderView();
    await screen.findByText('Raid Plan');

    fireEvent.click(screen.getByTitle('Delete doc'));

    expect(docsApi.remove).not.toHaveBeenCalled();
  });
});
