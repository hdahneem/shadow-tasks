import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { notificationsApi } from '../api/services';
import type { NotificationPreference, NotificationType } from '../types';

const TYPE_LABELS: Record<NotificationType, string> = {
  assigned: 'Assigned to a quest',
  comment_added: 'New comment on your quest',
  mentioned: 'Mentioned in a comment',
  due_soon: 'Quest due soon',
};

const TYPE_ORDER: NotificationType[] = ['assigned', 'comment_added', 'mentioned', 'due_soon'];

export function NotificationPreferencesModal({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = useState<NotificationPreference[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    notificationsApi.getPreferences().then((res) => {
      setPrefs(res);
      setLoaded(true);
    });
  }, []);

  const isMuted = (type: NotificationType) => prefs.find((p) => p.type === type)?.muted ?? false;

  const toggle = async (type: NotificationType, muted: boolean) => {
    setPrefs((prev) => prev.map((p) => (p.type === type ? { ...p, muted } : p)));
    await notificationsApi.setPreference(type, muted);
  };

  return (
    <Modal title="Notification Preferences" onClose={onClose}>
      {!loaded ? (
        <p className="text-sm text-mist-dim">Loading…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {TYPE_ORDER.map((type) => (
            <label key={type} className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm text-mist">{TYPE_LABELS[type]}</span>
              <input
                type="checkbox"
                checked={!isMuted(type)}
                onChange={(e) => toggle(type, !e.target.checked)}
                aria-label={`Notify me: ${TYPE_LABELS[type]}`}
                className="cursor-pointer"
              />
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
