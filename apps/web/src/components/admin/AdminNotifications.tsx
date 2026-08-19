'use client';

import { AdminNotificationsList } from './AdminNotificationsList';

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

import { typeConfig, type Notification } from './notificationTypes';
export type { Notification };
export { typeConfig };

import {
  loadNotifications, saveNotifications, useNotificationPoller,
} from './useNotificationPoller';

export function AdminNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => {
      setNotifications(loadNotifications());
    });
  }, []);

  const checkForUpdates = useNotificationPoller(setNotifications);

  // Пять минут, а не тридцать секунд.
  //
  // Тик колокольчика — три запроса к складу и аналитике, и раньше он уходил
  // дважды в минуту у каждой открытой админки. Срочное теперь приезжает
  // событием по `/api/events` (см. `useRealtime`), а этот опрос остался
  // страховкой на случай, когда поток недоступен, — и в такой роли ему
  // хватает пяти минут.
  useEffect(() => {
    checkForUpdates();
    const interval = setInterval(checkForUpdates, 5 * 60_000);
    return () => clearInterval(interval);
  }, [checkForUpdates]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    setNotifications(updated);
    saveNotifications(updated);
  };

  const clearAll = () => {
    setNotifications([]);
    saveNotifications([]);
    setOpen(false);
  };


  const fmtTime = (d: Date) => {
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Сейчас';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч назад`;
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Bell icon */}
      <button
        onClick={() => { setOpen(!open); if (!open) markAllRead(); }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
          padding: '6px', color: unreadCount > 0 ? 'var(--brand-primary)' : 'var(--text-secondary)',
          display: 'flex', alignItems: 'center',
        }}
      >
        <Clock size={18} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0,
            width: 16, height: 16, borderRadius: '50%',
            background: 'var(--error)', color: 'white',
            fontSize: '9px', fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--bg-primary)',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AdminNotificationsList
        open={open}
        notifications={notifications}
        clearAll={clearAll}
        fmtTime={fmtTime}
      />
    </div>
  );
}
