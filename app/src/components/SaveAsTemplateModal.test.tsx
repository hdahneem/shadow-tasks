import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SaveAsTemplateModal } from './SaveAsTemplateModal';

describe('SaveAsTemplateModal', () => {
  it('disables submit until a name is entered, then saves and closes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <SaveAsTemplateModal title="Save Project as Template" placeholder="e.g. Raid" onSave={onSave} onClose={onClose} />
    );

    const submit = screen.getByText('Save Template');
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('e.g. Raid'), { target: { value: 'Dungeon Raid' } });
    expect(submit).not.toBeDisabled();

    fireEvent.click(submit);

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Dungeon Raid'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows an error and stays open if saving fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('nope'));
    const onClose = vi.fn();
    render(<SaveAsTemplateModal title="Save" placeholder="Name" onSave={onSave} onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'My Template' } });
    fireEvent.click(screen.getByText('Save Template'));

    expect(await screen.findByText('Could not save the template. Please try again.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
