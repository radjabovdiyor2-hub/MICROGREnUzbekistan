'use client';

import { useState } from 'react';
import { Check, Clock, Play, RefreshCw } from 'lucide-react';
import { typeConfig, type Notification } from './notificationTypes';
import { tint } from '@/lib/tint';

// ══════════════════════════════════════════════════════════════════════
// Выпадающий список уведомлений админки.
//
// КНОПКА «ВЫПОЛНИТЬ»
//
// Офис кладёт в сигнал не только факт, но и что с ним делать:
// `suggested_action = {"action": "daily_backup", "bot": "devops_bot"}`
// (`shared/owner_alerts.raise_alert`). Поле доезжало до базы и до браузера
// и терялось на последнем шаге — колокольчик показывал «бэкап не удался»
// и не давал его перезапустить.
//
// Кнопка ничего не переводит и не додумывает: форма команды совпадает с
// телом `/api/admin/bot-action`, поэтому она отправляет ровно то, что
// предложил офис. Рискованное там по-прежнему уходит на подтверждение.
// ══════════════════════════════════════════════════════════════════════

/** Состояние одной команды: не запускали / в пути / чем закончилась. */
type RunState = 'idle' | 'running' | 'done' | 'failed';

function SuggestedAction({ action, bot }: { action: string; bot: string }) {
  const [state, setState] = useState<RunState>('idle');
  const [error, setError] = useState('');

  const run = async () => {
    if (state === 'running') return;
    setState('running');
    setError('');
    try {
      const res = await fetch('/api/admin/bot-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action, bot }),
      });
      const data = await res.json().catch(() => null);
      // `pending` — офис принял задачу, но ещё не доделал. Это успех:
      // бэкап и синк каталога идут дольше запроса.
      if (res.ok && data?.status !== 'error') {
        setState('done');
        return;
      }
      setError(data?.error || `Сервер ответил ${res.status}`);
      setState('failed');
    } catch {
      setError('Нет связи с сервером');
      setState('failed');
    }
  };

  if (state === 'done') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11px', color: 'var(--success)' }}>
        <Check size={12} /> Запущено
      </span>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={run}
        disabled={state === 'running'}
        className="btn btn-sm btn-primary"
        style={{ minHeight: 32, display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        {state === 'running' ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
        {state === 'running' ? 'Запускаю…' : 'Выполнить'}
      </button>
      {/* Что именно запустится — видно до нажатия, а не после. */}
      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{action}</span>
      {error && <span style={{ fontSize: '10px', color: 'var(--error)' }}>{error}</span>}
    </div>
  );
}


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
    position: 'absolute', top: '100%', right: 0, maxHeight: 400,
    // Ширина фиксированная (320px), но панель прижата к правому краю: на
    // узком экране она уходила левее своего контейнера и упиралась в край
    // окна. min() ограничивает её шириной вьюпорта с полями.
    width: 'min(320px, calc(100vw - var(--space-6)))',
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
              background: n.read ? 'transparent' : tint(cfg.color, 8),
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                background: tint(cfg.color), color: cfg.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {cfg.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>{n.message}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>{fmtTime(n.time)}</div>
                {n.action && (
                  <div style={{ marginTop: 'var(--space-2)' }}>
                    <SuggestedAction action={n.action.action} bot={n.action.bot} />
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  </div>
  );
}
