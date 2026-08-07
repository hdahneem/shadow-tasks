import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DocEditor } from './DocEditor';
import { docsApi } from '../api/services';
import { ApiError } from '../api/client';
import type { Doc } from '../types';

vi.mock('../api/services', () => ({
  docsApi: { get: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

vi.mock('../components/RichTextEditor', () => ({
  RichTextEditor: ({ value, onSave }: { value: string; onSave: (html: string) => void }) => (
    <textarea
      aria-label="content-editor"
      defaultValue={value}
      onBlur={(e) => onSave(e.target.value)}
    />
  ),
}));

function doc(overrides: Partial<Doc>): Doc {
  return {
    id: 'd1',
    workspaceId: 'w1',
    title: 'Raid Plan',
    content: '<p>Initial</p>',
    authorName: 'Baek Yoonho',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderEditor(docId = 'd1') {
  return render(
    <MemoryRouter initialEntries={[`/docs/${docId}`]}>
      <Routes>
        <Route path="/docs/:docId" element={<DocEditor />} />
        <Route path="/docs" element={<div>Docs List Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('DocEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and displays the doc', async () => {
    vi.mocked(docsApi.get).mockResolvedValue(doc({}));
    renderEditor();
    expect(await screen.findByLabelText('Doc title')).toHaveValue('Raid Plan');
    expect(screen.getByText(/Baek Yoonho/)).toBeInTheDocument();
  });

  it('shows a not-found message for a missing doc', async () => {
    vi.mocked(docsApi.get).mockRejectedValue(new ApiError(404, 'Doc not found'));
    renderEditor();
    expect(await screen.findByText('Doc not found.')).toBeInTheDocument();
  });

  it('saves the title on blur when changed', async () => {
    vi.mocked(docsApi.get).mockResolvedValue(doc({}));
    vi.mocked(docsApi.update).mockResolvedValue(doc({ title: 'Updated Plan' }));
    renderEditor();

    const titleInput = await screen.findByLabelText('Doc title');
    fireEvent.change(titleInput, { target: { value: 'Updated Plan' } });
    fireEvent.blur(titleInput);

    await waitFor(() => expect(docsApi.update).toHaveBeenCalledWith('d1', { title: 'Updated Plan' }));
  });

  it('does not save the title on blur when unchanged', async () => {
    vi.mocked(docsApi.get).mockResolvedValue(doc({}));
    renderEditor();

    const titleInput = await screen.findByLabelText('Doc title');
    fireEvent.blur(titleInput);

    expect(docsApi.update).not.toHaveBeenCalled();
  });

  it('saves content changes from the rich text editor', async () => {
    vi.mocked(docsApi.get).mockResolvedValue(doc({}));
    vi.mocked(docsApi.update).mockResolvedValue(doc({ content: '<p>Changed</p>' }));
    renderEditor();

    const contentEditor = await screen.findByLabelText('content-editor');
    fireEvent.change(contentEditor, { target: { value: '<p>Changed</p>' } });
    fireEvent.blur(contentEditor);

    await waitFor(() => expect(docsApi.update).toHaveBeenCalledWith('d1', { content: '<p>Changed</p>' }));
  });

  it('deletes the doc after confirmation and navigates back to the list', async () => {
    vi.mocked(docsApi.get).mockResolvedValue(doc({}));
    vi.mocked(docsApi.remove).mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderEditor();

    await screen.findByLabelText('Doc title');
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => expect(docsApi.remove).toHaveBeenCalledWith('d1'));
    expect(await screen.findByText('Docs List Page')).toBeInTheDocument();
  });

  it('does not delete when confirmation is cancelled', async () => {
    vi.mocked(docsApi.get).mockResolvedValue(doc({}));
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderEditor();

    await screen.findByLabelText('Doc title');
    fireEvent.click(screen.getByText('Delete'));

    expect(docsApi.remove).not.toHaveBeenCalled();
  });
});
