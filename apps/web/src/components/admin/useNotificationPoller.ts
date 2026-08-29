'use client';

import { useCallback } from 'react';
import { detach } from '@/lib/background';
import type { Notification } from './notificationTypes';

export const STORAGE_KEY = 'Microgreen_admin_notifications';

export interface OfficeAlert {
  id: string;
  kind: string;
  severity: string;
  title: string;
  message: string;
  source: string;
  /**
   * «Что с этим делать» в терминах пульта: `{action, bot}`.
   *
   * Офис кладёт сюда готовую команду (`shared/owner_alerts.raise_alert`),
   * форма совпадает с телом `/api/admin/bot-action`. Поле доезжало до
   * браузера и терялось здесь: колокольчик показывал «бэкап не удался» и
   * не давал его перезапустить.
   */
  suggestedAction?: { action?: string; bot?: string } | null;
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

      // Два источника — ПАРАЛЛЕЛЬНО.
      //
      // Были последовательные `await`, и колокольчик тратил на тик сумму всех
      // задержек. Один из них — `/api/inventory/analytics` — считает агрегаты
      // по складу, то есть самый долгий; второй ждал его без всякой причины:
      // между источниками зависимости нет.
      //
      // `allSettled`, а не `all`: отказ одного источника не должен лишать
      // владельца другого. Раньше падение первого же запроса выбрасывало
      // в общий catch и гасило весь тик.
      const [posRes, warnRes] = await Promise.allSettled([
        fetch(`/api/inventory/pos?date=${today}`).then(r => r.json()),
        fetch('/api/inventory/analytics?section=warnings').then(r => r.json()),
      ]);

      // Журнал читается ОДИН раз за тик.
      //
      // `loadNotifications()` — это `localStorage.getItem` плюс `JSON.parse`
      // до пятидесяти записей, и звался он из трёх мест, два из которых
      // внутри циклов. Синхронная работа на главном потоке каждые 30 секунд,
      // ради ответа на один и тот же вопрос «а это уже показывали?».
      const seen = new Set(loadNotifications().map(n => n.id));
      const data = posRes.status === 'fulfilled' ? posRes.value : {};
      const newNotifs: Notification[] = [];

      if (data.sales?.length > 0) {
        const latestSale = data.sales[0];
        const saleId = `sale_${latestSale.number}`;
        if (!seen.has(saleId)) {
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

      const warnData = warnRes.status === 'fulfilled' ? warnRes.value : {};
      if (warnData.warnings?.length > 0) {
        const criticals = (warnData.warnings as StockWarning[]).filter((w) => w.level === 'CRITICAL');
        for (const w of criticals.slice(0, 3)) {
          const warnId = `warn_${w.message.replace(/\s/g, '_').slice(0, 30)}`;
          if (!seen.has(warnId)) {
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
        const alertRes = await fetch('/api/admin/alerts', { credentials: 'same-origin' });
        const alertData = await alertRes.json();
        if (alertRes.ok && Array.isArray(alertData.alerts) && alertData.alerts.length > 0) {
          for (const a of alertData.alerts as OfficeAlert[]) {
            const alertId = `office_${a.id}`;
            if (seen.has(alertId)) continue;
            const suggested = a.suggestedAction;
            newNotifs.push({
              id: alertId,
              type: 'office',
              message: `${a.title} — ${a.message}`.slice(0, 300),
              time: new Date(a.createdAt),
              read: false,
              // Команду проносим дальше: без неё сигнал остаётся рассказом
              // о проблеме, а не способом её решить.
              action:
                suggested?.action && suggested?.bot
                  ? { action: suggested.action, bot: suggested.bot }
                  : undefined,
            });
          }
          // Пометку «прочитано» не ждём: она ничего не даёт этому тику, а
          // ответ на неё владелец ждал наравне с самими оповещениями.
          detach(
            'пометка оповещений прочитанными',
            fetch('/api/admin/alerts', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ all: true }),
            }),
          );
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
