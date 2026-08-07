import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../api/services';
import { NotificationPreferencesModal } from './NotificationPreferencesModal';
import type { AppNotification } from '../types';

function describeNotification(n: AppNotification): string {
  const who = n.actorName ?? 'Someone';
  switch (n.type) {
    case 'assigned':
      return `${who} assigned you to "${n.taskTitle}"`;
    case 'comment_added':
      return `${who} commented on "${n.taskTitle}"`;
    case 'mentioned':
      return `${who} mentioned you on "${n.taskTitle}"`;
    case 'due_soon':
      return `"${n.taskTitle}" is due soon`;
    default:
      return n.taskTitle;
  }
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const refetch = () => {
    notificationsApi.list().then((res) => {
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    });
  };

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const openNotification = async (n: AppNotification) => {
    setOpen(false);
    navigate(`/tasks/${n.taskId}`);
    if (!n.readAt) {
      await notificationsApi.markRead(n.id);
      refetch();
    }
  };

  const markAllRead = async () => {
    await notificationsApi.markAllRead();
    refetch();
  };

  const dismiss = async (id: string, e: ReactMouseEvent) => {
    e.stopPropagation();
    await notificationsApi.remove(id);
    refetch();
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative text-mist hover:text-cyan-bright cursor-pointer px-1 text-sm"
        aria-label="Notifications"
      >
        ◈
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[9px] leading-4 text-center font-mono">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 z-50 bg-void border border-cyan-dim/30 shadow-lg max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-cyan-dim/15">
            <span className="font-display text-xs tracking-widest uppercase text-mist">Notifications</span>
            <div className="flex items-center gap-2.5">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[10px] text-cyan-dim hover:text-cyan-bright cursor-pointer"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setPreferencesOpen(true)}
                className="text-mist-dim hover:text-cyan-bright cursor-pointer text-xs"
                aria-label="Notification preferences"
                title="Notification preferences"
              >
                ⚙
              </button>
            </div>
          </div>
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-mist-dim">No notifications yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-cyan-dim/10">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`group flex items-center gap-1 px-3 py-2 text-xs hover:bg-cyan-dim/5 ${
                    n.readAt ? 'text-mist-dim' : 'text-mist'
                  }`}
                >
                  <button onClick={() => openNotification(n)} className="flex-1 min-w-0 text-left cursor-pointer">
                    {!n.readAt && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan mr-1.5 align-middle" />
                    )}
                    {describeNotification(n)}
                  </button>
                  <button
                    onClick={(e) => dismiss(n.id, e)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-mist-dim hover:text-danger cursor-pointer px-1"
                    aria-label="Dismiss notification"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {preferencesOpen && <NotificationPreferencesModal onClose={() => setPreferencesOpen(false)} />}
    </div>
  );
}
