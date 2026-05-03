'use client';

import { useState, useEffect, useCallback } from 'react';
import * as Icons from '@/components/ui/Icons';

interface Notification {
  id: string;
  type: 'sale' | 'low_stock' | 'order' | 'info';
  message: string;
  time: Date;
  read: boolean;
}

// In-memory notification store (persists across tab sessions via localStorage)
const STORAGE_KEY = 'Microgreen_admin_notifications';

function loadNotifications(): Notification[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored).map((n: any) => ({ ...n, time: new Date(n.time) }));
  } catch { return []; }
}

function saveNotifications(notifs: Notification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs.slice(0, 50)));
  } catch {}
}

export function AdminNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [lastCheck, setLastCheck] = useState<string>('');

  // Load from storage on mount
  useEffect(() => {
    setNotifications(loadNotifications());
  }, []);

  // Poll for new sales/stock events every 30 seconds
  const checkForUpdates = useCallback(async () => {
    try {
      // Check recent POS sales
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/inventory/pos?date=${today}`);
      const data = await res.json();
      const newNotifs: Notification[] = [];

      if (data.sales?.length > 0) {
        const latestSale = data.sales[0];
        const saleId = `sale_${latestSale.number}`;

        // Only add if not already tracked
        const existing = loadNotifications();
        if (!existing.some(n => n.id === saleId)) {
          const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');
          newNotifs.push({
            id: saleId,
            type: 'sale',
            message: `Sotish ${latestSale.number} — ${fmt(latestSale.total)} so'm (${latestSale.itemCount} ta tovar)`,
            time: new Date(latestSale.time),
            read: false,
          });
        }
      }

      // Check low stock warnings
      const warnRes = await fetch('/api/inventory/analytics?section=warnings');
      const warnData = await warnRes.json();
      if (warnData.warnings?.length > 0) {
        const criticals = warnData.warnings.filter((w: any) => w.level === 'CRITICAL');
        for (const w of criticals.slice(0, 3)) {
          const warnId = `warn_${w.message.replace(/\s/g, '_').slice(0, 30)}`;
          const existing = loadNotifications();
          if (!existing.some(n => n.id === warnId)) {
            newNotifs.push({
              id: warnId,
              type: 'low_stock',
              message: w.message,
              time: new Date(),
              read: false,
            });
          }
        }
      }

      if (newNotifs.length > 0) {
        const all = [...newNotifs, ...loadNotifications()].slice(0, 50);
        saveNotifications(all);
        setNotifications(all);
      }
    } catch (e) {
      console.error('[Notifications] Poll error:', e);
    }
  }, []);

  useEffect(() => {
    checkForUpdates();
    const interval = setInterval(checkForUpdates, 30000);
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

  const typeConfig: Record<string, { icon: React.ReactNode; color: string }> = {
    sale: { icon: <Icons.ShoppingCart size={14} />, color: '#10B981' },
    low_stock: { icon: <Icons.AlertTriangle size={14} />, color: '#EF4444' },
    order: { icon: <Icons.Package size={14} />, color: '#3B82F6' },
    info: { icon: <Icons.Clock size={14} />, color: '#6366F1' },
  };

  const fmtTime = (d: Date) => {
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Hozir';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} daq oldin`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} soat oldin`;
    return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' });
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
        <Icons.Clock size={18} />
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

      {/* Dropdown */}
      {open && (
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
            <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>Bildirishnomalar</span>
            <button onClick={clearAll} style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              fontSize: 'var(--text-xs)', cursor: 'pointer',
            }}>
              Tozalash
            </button>
          </div>

          {/* List */}
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Icons.Clock size={32} style={{ opacity: 0.3 }} />
                <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>Bildirishnoma yo'q</p>
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
      )}
    </div>
  );
}
