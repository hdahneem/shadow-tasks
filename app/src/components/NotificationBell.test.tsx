import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';
import { notificationsApi } from '../api/services';
import type { AppNotification } from '../types';

vi.mock('../api/services', () => ({
  notificationsApi: {
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    remove: vi.fn(),
    getPreferences: vi.fn(),
    setPreference: vi.fn(),
  },
}));

function notif(overrides: Partial<AppNotification>): AppNotification {
  return {
    id: 'n1',
    type: 'assigned',
    taskId: 't1',
    taskTitle: 'Clear the gate',
    actorName: 'Cha Hae-In',
    payload: null,
    readAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderBell() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <NotificationBell />
      <Routes>
        <Route path="/" element={<div>Status Window Page</div>} />
        <Route path="/tasks/:id" element={<div>Task Detail Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows no badge when there are no unread notifications', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({ notifications: [], unreadCount: 0 });
    renderBell();
    await waitFor(() => expect(notificationsApi.list).toHaveBeenCalled());
    expect(screen.queryByText('9+')).not.toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('shows the unread count badge', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({
      notifications: [notif({})],
      unreadCount: 1,
    });
    renderBell();
    expect(await screen.findByText('1')).toBeInTheDocument();
  });

  it('describes each notification type', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({
      notifications: [
        notif({ id: 'n1', type: 'assigned', actorName: 'Cha Hae-In', taskTitle: 'Clear the gate' }),
        notif({ id: 'n2', type: 'comment_added', actorName: 'Baek Yoonho', taskTitle: 'Scout ahead' }),
        notif({ id: 'n3', type: 'mentioned', actorName: 'Cha Hae-In', taskTitle: 'Plan raid' }),
        notif({ id: 'n4', type: 'due_soon', actorName: null, taskTitle: 'Turn in report' }),
      ],
      unreadCount: 4,
    });
    renderBell();
    fireEvent.click(await screen.findByLabelText('Notifications'));

    expect(await screen.findByText('Cha Hae-In assigned you to "Clear the gate"')).toBeInTheDocument();
    expect(screen.getByText('Baek Yoonho commented on "Scout ahead"')).toBeInTheDocument();
    expect(screen.getByText('Cha Hae-In mentioned you on "Plan raid"')).toBeInTheDocument();
    expect(screen.getByText('"Turn in report" is due soon')).toBeInTheDocument();
  });

  it('shows an empty state when there are no notifications', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({ notifications: [], unreadCount: 0 });
    renderBell();
    fireEvent.click(await screen.findByLabelText('Notifications'));
    expect(await screen.findByText('No notifications yet.')).toBeInTheDocument();
  });

  it('navigates to the task and marks it read when clicked', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({
      notifications: [notif({ id: 'n1', taskId: 't1' })],
      unreadCount: 1,
    });
    vi.mocked(notificationsApi.markRead).mockResolvedValue(notif({ readAt: '2026-08-01T01:00:00.000Z' }));
    renderBell();
    fireEvent.click(await screen.findByLabelText('Notifications'));

    fireEvent.click(await screen.findByText(/assigned you to/));

    expect(await screen.findByText('Task Detail Page')).toBeInTheDocument();
    await waitFor(() => expect(notificationsApi.markRead).toHaveBeenCalledWith('n1'));
  });

  it('marks all notifications as read', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({
      notifications: [notif({})],
      unreadCount: 1,
    });
    vi.mocked(notificationsApi.markAllRead).mockResolvedValue(undefined);
    renderBell();
    fireEvent.click(await screen.findByLabelText('Notifications'));

    fireEvent.click(await screen.findByText('Mark all read'));

    await waitFor(() => expect(notificationsApi.markAllRead).toHaveBeenCalled());
  });

  it('dismisses a notification without navigating to its task', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({
      notifications: [notif({ id: 'n1' })],
      unreadCount: 1,
    });
    vi.mocked(notificationsApi.remove).mockResolvedValue(undefined);
    renderBell();
    fireEvent.click(await screen.findByLabelText('Notifications'));

    fireEvent.click(await screen.findByLabelText('Dismiss notification'));

    await waitFor(() => expect(notificationsApi.remove).toHaveBeenCalledWith('n1'));
    expect(screen.queryByText('Task Detail Page')).not.toBeInTheDocument();
  });

  it('opens notification preferences from the gear icon', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({ notifications: [], unreadCount: 0 });
    vi.mocked(notificationsApi.getPreferences).mockResolvedValue([
      { type: 'assigned', muted: false },
      { type: 'comment_added', muted: true },
      { type: 'mentioned', muted: false },
      { type: 'due_soon', muted: false },
    ]);
    renderBell();
    fireEvent.click(await screen.findByLabelText('Notifications'));

    fireEvent.click(await screen.findByLabelText('Notification preferences'));

    expect(await screen.findByText('Notification Preferences')).toBeInTheDocument();
    expect(await screen.findByLabelText('Notify me: New comment on your quest')).not.toBeChecked();
    expect(screen.getByLabelText('Notify me: Assigned to a quest')).toBeChecked();
  });

  it('toggles a notification preference', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({ notifications: [], unreadCount: 0 });
    vi.mocked(notificationsApi.getPreferences).mockResolvedValue([
      { type: 'assigned', muted: false },
      { type: 'comment_added', muted: false },
      { type: 'mentioned', muted: false },
      { type: 'due_soon', muted: false },
    ]);
    vi.mocked(notificationsApi.setPreference).mockResolvedValue({ type: 'assigned', muted: true });
    renderBell();
    fireEvent.click(await screen.findByLabelText('Notifications'));
    fireEvent.click(await screen.findByLabelText('Notification preferences'));

    const checkbox = await screen.findByLabelText('Notify me: Assigned to a quest');
    fireEvent.click(checkbox);

    await waitFor(() => expect(notificationsApi.setPreference).toHaveBeenCalledWith('assigned', true));
    expect(checkbox).not.toBeChecked();
  });
});
