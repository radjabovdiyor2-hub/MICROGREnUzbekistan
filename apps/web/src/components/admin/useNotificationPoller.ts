'use client';

import { useCallback } from 'react';
import { fetchBatches, getBatchStatus } from './growingData';
import type { Notification } from './notificationTypes';

export const STORAGE_KEY = 'Microgreen_admin_notifications';

export interface OfficeAlert {
  id: string;
  kind: string;
  severity: string;
  title: string;
  message: string;
  source: string;
  createdAt: string;
}

export interface StockWarning {
  level: string;
  message: string;
}

export function loadNotifications(): Notification[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const raw: (Omit<Notification, 'time'> & { time: string })[] = JSON.parse(stored);
    return raw.map((n) => ({ ...n, time: new Date(n.time) }));
  } catch { return []; }
}

export function saveNotifications(notifs: Notification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs.slice(0, 50)));
  } catch { /* ignore */ }
}

export function useNotificationPoller(setNotifications: (fn: (prev: Notification[]) => Notification[]) => void) {
  const checkForUpdates = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/inventory/pos?date=${today}`);
      const data = await res.json();
      const newNotifs: Notification[] = [];

      if (data.sales?.length > 0) {
        const latestSale = data.sales[0];
        const saleId = `sale_${latestSale.number}`;
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

      const warnRes = await fetch('/api/inventory/analytics?section=warnings');
      const warnData = await warnRes.json();
      if (warnData.warnings?.length > 0) {
        const criticals = (warnData.warnings as StockWarning[]).filter((w) => w.level === 'CRITICAL');
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

      try {
        let readyCount = 0;
        let expiredCount = 0;
        for (const batch of await fetchBatches()) {
          const { status } = getBatchStatus(batch);
          if (status === 'expired') expiredCount++;
          else if (status === 'ready') readyCount++;
        }
        if (readyCount > 0 || expiredCount > 0) {
          const growId = `grow_${today}`;
          const existing2 = loadNotifications();
          if (!existing2.some(n => n.id === growId)) {
            const parts = [];
            if (readyCount > 0) parts.push(`${readyCount} партий готовы к продаже`);
            if (expiredCount > 0) parts.push(`${expiredCount} просрочено!`);
            newNotifs.push({
              id: growId,
              type: 'growing',
              message: `🌱 ${parts.join(' · ')}`,
              time: new Date(),
              read: false,
            });
          }
        }
      } catch (err) {
        console.warn('Проверка остатков не удалась:', err);
      }

      try {
        const alertRes = await fetch('/api/admin/alerts', { credentials: 'same-origin' });
        const alertData = await alertRes.json();
        if (alertRes.ok && Array.isArray(alertData.alerts) && alertData.alerts.length > 0) {
          const existing3 = loadNotifications();
          for (const a of alertData.alerts as OfficeAlert[]) {
            const alertId = `office_${a.id}`;
            if (existing3.some(n => n.id === alertId)) continue;
            newNotifs.push({
              id: alertId,
              type: 'office',
              message: `${a.title} — ${a.message}`.slice(0, 300),
              time: new Date(a.createdAt),
              read: false,
            });
          }
          await fetch('/api/admin/alerts', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ all: true }),
          });
        }
      } catch (e) {
        console.error('[Notifications] Office alerts error:', e);
      }

      if (newNotifs.length > 0) {
        const all = [...newNotifs, ...loadNotifications()].slice(0, 50);
        saveNotifications(all);
        setNotifications(() => all);
      }
    } catch (e) {
      console.error('[Notifications] Poll error:', e);
    }
  }, [setNotifications]);

  return checkForUpdates;
}
