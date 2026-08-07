import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CustomFieldsPanel } from './CustomFieldsPanel';
import type { TaskCustomField } from '../types';
import { fieldsApi } from '../api/services';

vi.mock('../api/services', () => ({
  fieldsApi: { setValue: vi.fn().mockResolvedValue({}) },
}));

function renderPanel(fields: TaskCustomField[], onChanged = vi.fn()) {
  return render(
    <MemoryRouter>
      <CustomFieldsPanel taskId="t1" projectId="p1" fields={fields} onChanged={onChanged} />
    </MemoryRouter>
  );
}

describe('CustomFieldsPanel', () => {
  beforeEach(() => {
    vi.mocked(fieldsApi.setValue).mockClear();
  });

  it('shows an empty state with a link to the project when there are no fields', () => {
    renderPanel([]);
    expect(screen.getByText(/no custom fields yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add some/i })).toHaveAttribute('href', '/projects/p1');
  });

  it('toggles a checkbox field and saves the new value', async () => {
    const field: TaskCustomField = { id: 'f1', name: 'Blocked', type: 'checkbox', options: null, value: false };
    renderPanel([field]);

    fireEvent.click(screen.getByRole('button', { name: '' }));
    expect(fieldsApi.setValue).toHaveBeenCalledWith('t1', 'f1', true);
  });

  it('saves a rating click, and clicking the same star again clears it', async () => {
    const field: TaskCustomField = { id: 'f2', name: 'Difficulty', type: 'rating', options: null, value: 0 };
    renderPanel([field]);

    fireEvent.click(screen.getByLabelText('3 stars'));
    expect(fieldsApi.setValue).toHaveBeenCalledWith('t1', 'f2', 3);
  });

  it('renders dropdown options and preserves an orphaned stored value', () => {
    const field: TaskCustomField = {
      id: 'f3',
      name: 'Status',
      type: 'dropdown',
      options: ['Easy', 'Hard'],
      value: 'Legendary', // no longer a valid option
    };
    renderPanel([field]);

    const select = screen.getByDisplayValue(/legendary/i) as HTMLSelectElement;
    expect(select.value).toBe('Legendary');
    expect(screen.getByText('Easy')).toBeInTheDocument();
    expect(screen.getByText('Hard')).toBeInTheDocument();
  });

  it('toggles multi-select options independently', () => {
    const field: TaskCustomField = {
      id: 'f4',
      name: 'Tags',
      type: 'multi_select',
      options: ['Urgent', 'Bug', 'Feature'],
      value: ['Bug'],
    };
    renderPanel([field]);

    fireEvent.click(screen.getByText('Urgent'));
    expect(fieldsApi.setValue).toHaveBeenCalledWith('t1', 'f4', ['Bug', 'Urgent']);
  });

  it('saves a currency value on blur, formatted as a number', () => {
    const field: TaskCustomField = { id: 'f5', name: 'Budget', type: 'currency', options: null, value: null };
    renderPanel([field]);

    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '250' } });
    fireEvent.blur(input);
    expect(fieldsApi.setValue).toHaveBeenCalledWith('t1', 'f5', 250);
  });
});
