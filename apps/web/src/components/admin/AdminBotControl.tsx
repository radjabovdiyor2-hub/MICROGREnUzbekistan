'use client';

import { useState } from 'react';
import { RefreshCw, Sparkles, CheckCircle2, AlertTriangle, Zap } from 'lucide-react';

import {
  BOT_ACTIONS, describeResult, type BotActionConfig, type ResultStatus,
} from './botActions';

import { AdminBotControlHeader } from './AdminBotControlHeader';

export function AdminBotControl({ lang }: { lang: 'ru' | 'uz' }) {
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ action: string; status: ResultStatus; message: string } | null>(null);

  const triggerAction = async (item: BotActionConfig) => {
    setRunningAction(item.action);
    setLastResult(null);
    try {
      const res = await fetch('/api/admin/bot-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: item.action, bot: item.bot }),
      });
      const data: Record<string, unknown> = await res.json().catch(() => ({}));

      if (!res.ok || data.status === 'error') {
        setLastResult({
          action: item.name,
          status: 'error',
          message: (data.error as string) || `Ошибка ${res.status}`,
        });
      } else if (data.status === 'pending') {
        setLastResult({
          action: item.name,
          status: 'pending',
          message: (data.message as string) || 'Задача в очереди, бот пока не ответил.',
        });
      } else {
        const detail = describeResult(data);
        setLastResult({
          action: item.name,
          status: 'ok',
          message: detail
            ? `Выполнено: ${detail}`
            : `${item.action} выполнено ботом ${(data.bot as string) || item.name}.`,
        });
      }
    } catch (err: unknown) {
      setLastResult({
        action: item.name,
        status: 'error',
        message: err instanceof Error ? err.message : 'Сеть недоступна',
      });
    } finally {
      setRunningAction(null);
    }
  };

  const statusColor = lastResult
    ? lastResult.status === 'ok' ? 'var(--success)'
      : lastResult.status === 'pending' ? 'var(--warning)'
      : 'var(--error)'
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <AdminBotControlHeader lang={lang} lastResult={lastResult} statusColor={statusColor} />

      {/* Action Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 'var(--space-4)',
      }}>
        {BOT_ACTIONS.map((item) => {
          const Icon = item.icon;
          const isRunning = runningAction === item.action;
          return (
            <div key={item.action} className="card" style={{
              padding: 0,
              display: 'flex', flexDirection: 'column',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Colored top accent bar */}
              <div style={{
                height: 3,
                background: `linear-gradient(90deg, ${item.color}, color-mix(in srgb, ${item.color} 40%, transparent))`,
                flexShrink: 0,
              }} />

              {/* Subtle colored glow in top-right corner */}
              <div style={{
                position: 'absolute', right: -20, top: -20, width: 100, height: 100,
                borderRadius: '50%', background: `color-mix(in srgb, ${item.color} 8%, transparent)`,
                filter: 'blur(30px)', pointerEvents: 'none',
              }} />

              <div style={{
                padding: 'var(--space-4) var(--space-5) var(--space-5)',
                display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between',
                position: 'relative', zIndex: 1,
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                    <div style={{
                      width: 46, height: 46, borderRadius: 'var(--radius-lg)',
                      background: `color-mix(in srgb, ${item.color} 15%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${item.color} 25%, transparent)`,
                      color: item.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Icon size={22} />
                    </div>
                    <div>
                      <h3 style={{
                        fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)',
                        fontSize: 'var(--text-base)', color: 'var(--text-primary)', margin: 0,
                      }}>
                        {item.name}
                      </h3>
                      <span style={{
                        fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)',
                        display: 'block', marginTop: 2,
                      }}>
                        {item.action}
                      </span>
                    </div>
                  </div>

                  <p style={{
                    color: 'var(--text-secondary)', fontSize: 'var(--text-xs)',
                    lineHeight: 1.6, margin: '0 0 var(--space-4)',
                  }}>
                    {item.description}
                  </p>
                </div>

                <button
                  onClick={() => triggerAction(item)}
                  disabled={isRunning}
                  className="btn btn-primary btn-block"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    opacity: isRunning ? 0.6 : 1,
                    cursor: isRunning ? 'wait' : 'pointer',
                  }}
                >
                  {isRunning ? (
                    <>
                      <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>Выполнение...</span>
                    </>
                  ) : (
                    <>
                      <Zap size={16} />
                      <span>Запустить Задачу</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
