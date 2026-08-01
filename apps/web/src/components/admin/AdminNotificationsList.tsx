'use client';

import { Clock } from 'lucide-react';
import { typeConfig, type Notification } from './notificationTypes';

// Выпадающий список уведомлений админки.


interface Props {
  open: boolean;
  notifications: Notification[];
  clearAll: () => void;
  fmtTime: (d: Date) => string;
}

export function AdminNotificationsList({ open, notifications, clearAll, fmtTime }: Props) {
  if (!open) return null;

  return (
  <div style={{
    position: 'absolute', top: '100%', right: 0, width: 320, maxHeight: 400,
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
    zIndex: 100, overflow: 'hidden',
  }}>
    {/* Header */}
    <div style={{
      padding: 'var(--space-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>Уведомления</span>
      <button onClick={clearAll} style={{
        background: 'none', border: 'none', color: 'var(--text-muted)',
        fontSize: 'var(--text-xs)', cursor: 'pointer',
      }}>
        Очистить
      </button>
    </div>

    {/* List */}
    <div style={{ maxHeight: 340, overflowY: 'auto' }}>
      {notifications.length === 0 ? (
        <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Clock size={32} style={{ opacity: 0.3 }} />
          <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>Нет уведомлений</p>
        </div>
      ) : (
        notifications.map(n => {
          const cfg = typeConfig[n.type] || typeConfig.info;
          return (
            <div key={n.id} style={{
              padding: 'var(--space-3)', borderBottom: '1px solid var(--border)',
              display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start',
              background: n.read ? 'transparent' : `${cfg.color}08`,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                background: `${cfg.color}15`, color: cfg.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {cfg.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>{n.message}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>{fmtTime(n.time)}</div>
              </div>
            </div>
          );
        })
      )}
    </div>
  </div>
  );
}
