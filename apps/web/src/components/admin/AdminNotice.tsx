'use client';

import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

// ══════════════════════════════════════════════════════════════════════
// Плашка «что случилось» — одна на всю админку.
//
// ЗАЧЕМ
//
// Сообщать человеку результат действия экраны умели по-разному: где-то
// цветной блок, где-то `alert()`, а чаще всего — `console.error` и тишина.
// Приём платежа по долгу на слабой сети выглядел так: модалка закрылась,
// список прежний, не сказано ничего — и человек нажимал ещё раз, проводя
// ВТОРОЙ платёж.
//
// Разметка блока при этом была скопирована в нескольких экранах с чуть
// разными полями и своими наборами тонов ('success'|'error' против
// 'ok'|'warn'|'err'). Здесь она одна.
//
// Это не замена всплывающему уведомлению: тост говорит об успехе и
// исчезает, плашка остаётся рядом с местом, где отказ произошёл, — и
// потому годится для ошибки, которую надо прочитать и исправить.
// ══════════════════════════════════════════════════════════════════════

export type NoticeTone = 'error' | 'warning' | 'success' | 'info';

const TONE: Record<NoticeTone, { bg: string; fg: string; icon: ReactNode }> = {
  error: { bg: 'var(--error-bg)', fg: 'var(--error)', icon: <XCircle size={16} /> },
  warning: { bg: 'var(--warning-bg)', fg: 'var(--warning)', icon: <AlertTriangle size={16} /> },
  success: { bg: 'var(--success-bg)', fg: 'var(--success)', icon: <CheckCircle size={16} /> },
  info: { bg: 'var(--info-bg)', fg: 'var(--info)', icon: <Info size={16} /> },
};

export function AdminNotice({ tone = 'error', children }: {
  tone?: NoticeTone;
  /** Пустая строка и `null` не рисуются: вызывающему не нужен свой `&&`. */
  children: ReactNode;
}) {
  if (children === null || children === undefined || children === '') return null;

  const style = TONE[tone];

  return (
    <div
      // `role="alert"` — чтобы отказ дочитали и с экрана: он появляется
      // после действия, и без роли программа чтения его пропустит.
      role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        borderRadius: 'var(--radius-md)',
        background: style.bg,
        color: style.fg,
        fontSize: 'var(--text-sm)',
        fontWeight: 'var(--font-semibold)',
        marginBottom: 'var(--space-3)',
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex' }}>{style.icon}</span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}
