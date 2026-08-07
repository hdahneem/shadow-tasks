import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ManageAutomationsModal } from './ManageAutomationsModal';
import { automationsApi, statusesApi, workspacesApi, tagsApi } from '../api/services';
import type { Automation, Status, Tag, WorkspaceMember } from '../types';

vi.mock('../api/services', () => ({
  automationsApi: { listForProject: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  statusesApi: { listForProject: vi.fn() },
  workspacesApi: { members: vi.fn() },
  tagsApi: { list: vi.fn() },
}));

const statuses: Status[] = [
  { id: 's1', projectId: 'p1', name: 'To Do', color: '#7c93b3', position: 1, isCompleted: false, createdAt: '' },
  { id: 's2', projectId: 'p1', name: 'Done', color: '#4ade80', position: 2, isCompleted: true, createdAt: '' },
];

const members: WorkspaceMember[] = [
  { id: 'm1', role: 'owner', createdAt: '', user: { id: 'u1', name: 'Sung Jin-Woo', email: 'sung@example.com' } },
];

const tags: Tag[] = [{ id: 't1', workspaceId: 'w1', name: 'Urgent', color: '#f43f5e', createdAt: '' }];

function automation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: 'a1',
    projectId: 'p1',
    name: 'Sample rule',
    enabled: true,
    triggerType: 'task_created',
    triggerConfig: {},
    actionType: 'set_priority',
    actionConfig: { priority: 'high' },
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function renderModal() {
  return render(<ManageAutomationsModal projectId="p1" workspaceId="w1" onClose={vi.fn()} />);
}

describe('ManageAutomationsModal', () => {
  beforeEach(() => {
    vi.mocked(statusesApi.listForProject).mockResolvedValue(statuses);
    vi.mocked(workspacesApi.members).mockResolvedValue(members);
    vi.mocked(tagsApi.list).mockResolvedValue(tags);
  });

  it('shows an empty state and a readable summary of existing automations', async () => {
    vi.mocked(automationsApi.listForProject).mockResolvedValue([
      automation({ triggerType: 'status_changed_to', triggerConfig: { statusId: 's2' }, actionType: 'assign_user', actionConfig: { userId: 'u1' } }),
    ]);

    renderModal();

    expect(await screen.findByText('Sample rule')).toBeInTheDocument();
    expect(screen.getByText('Status changed to Done → assign Sung Jin-Woo')).toBeInTheDocument();
  });

  it('shows an empty state when there are no automations', async () => {
    vi.mocked(automationsApi.listForProject).mockResolvedValue([]);
    renderModal();
    expect(await screen.findByText('No automations yet.')).toBeInTheDocument();
  });

  it('creates a task_created -> set_priority automation', async () => {
    vi.mocked(automationsApi.listForProject).mockResolvedValue([]);
    vi.mocked(automationsApi.create).mockResolvedValue(automation({}));

    renderModal();
    await screen.findByText('No automations yet.');

    fireEvent.change(screen.getByPlaceholderText('e.g. Notify on completion'), { target: { value: 'Urgent by default' } });
    fireEvent.click(screen.getByText('+ Add Automation'));

    await waitFor(() =>
      expect(automationsApi.create).toHaveBeenCalledWith('p1', {
        name: 'Urgent by default',
        triggerType: 'task_created',
        triggerConfig: {},
        actionType: 'set_priority',
        actionConfig: { priority: 'medium' },
      })
    );
  });

  it('reveals a status selector when the trigger is Status Changed To', async () => {
    vi.mocked(automationsApi.listForProject).mockResolvedValue([]);
    renderModal();
    await screen.findByText('No automations yet.');

    fireEvent.change(screen.getByDisplayValue('Task Created'), { target: { value: 'status_changed_to' } });
    expect(screen.getByText('Target Status')).toBeInTheDocument();
  });

  it('toggles an automation enabled/disabled', async () => {
    vi.mocked(automationsApi.listForProject).mockResolvedValue([automation({ enabled: true })]);
    vi.mocked(automationsApi.update).mockResolvedValue(automation({ enabled: false }));

    renderModal();
    const checkbox = await screen.findByRole('checkbox');
    fireEvent.click(checkbox);

    await waitFor(() => expect(automationsApi.update).toHaveBeenCalledWith('a1', { enabled: false }));
  });

  it('deletes an automation after confirming', async () => {
    vi.mocked(automationsApi.listForProject).mockResolvedValue([automation({})]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderModal();
    await screen.findByText('Sample rule');
    fireEvent.click(screen.getByText('✕'));

    await waitFor(() => expect(automationsApi.remove).toHaveBeenCalledWith('a1'));
  });

  it('summarizes an assignee_added -> add_tag automation, resolving the tag name', async () => {
    vi.mocked(automationsApi.listForProject).mockResolvedValue([
      automation({ triggerType: 'assignee_added', actionType: 'add_tag', actionConfig: { tagId: 't1' } }),
    ]);
    renderModal();
    expect(await screen.findByText('Assignee Added → add the "Urgent" tag')).toBeInTheDocument();
  });

  it('creates an assignee_added -> add_tag automation', async () => {
    vi.mocked(automationsApi.listForProject).mockResolvedValue([]);
    vi.mocked(automationsApi.create).mockResolvedValue(automation({}));

    renderModal();
    await screen.findByText('No automations yet.');

    fireEvent.change(screen.getByPlaceholderText('e.g. Notify on completion'), { target: { value: 'Tag on assign' } });
    fireEvent.change(screen.getByDisplayValue('Task Created'), { target: { value: 'assignee_added' } });
    fireEvent.change(screen.getByDisplayValue('Set Priority'), { target: { value: 'add_tag' } });
    fireEvent.click(screen.getByText('+ Add Automation'));

    await waitFor(() =>
      expect(automationsApi.create).toHaveBeenCalledWith('p1', {
        name: 'Tag on assign',
        triggerType: 'assignee_added',
        triggerConfig: {},
        actionType: 'add_tag',
        actionConfig: { tagId: 't1' },
      })
    );
  });

  it('disables submission and explains when add_tag is selected but the workspace has no tags', async () => {
    vi.mocked(tagsApi.list).mockResolvedValue([]);
    vi.mocked(automationsApi.listForProject).mockResolvedValue([]);
    renderModal();
    await screen.findByText('No automations yet.');

    fireEvent.change(screen.getByPlaceholderText('e.g. Notify on completion'), { target: { value: 'Whatever' } });
    fireEvent.change(screen.getByDisplayValue('Set Priority'), { target: { value: 'add_tag' } });

    expect(screen.getByText(/No tags exist in this workspace yet/)).toBeInTheDocument();
    expect(screen.getByText('+ Add Automation')).toBeDisabled();
  });
});
