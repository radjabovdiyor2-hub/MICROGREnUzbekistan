'use client';

import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { STEPAN_SUGGESTIONS } from './AdminStepanHeader';
import { AdminStepanProposal, type Proposal } from './AdminStepanProposal';

export interface Msg {
  role: 'user' | 'assistant';
  content: string;
  proposals?: Proposal[];
  done?: Record<number, { ok: boolean; text: string }>;
}

interface Props {
  messages: Msg[];
  busy: boolean;
  error: string;
  send: (text: string) => void;
  confirm: (msgIndex: number, propIndex: number, proposal: Proposal) => void;
  reject: (msgIndex: number, propIndex: number) => void;
  lang: 'ru' | 'uz';
  t: (ru: string, uz: string) => string;
  bottomRef: React.RefObject<HTMLDivElement | null>;
}

export function AdminStepanChatList({
  messages, busy, error, send, confirm, reject, lang, t, bottomRef,
}: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', minHeight: 200 }}>
      {messages.length === 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {STEPAN_SUGGESTIONS.map(s => (
            <button key={s} onClick={() => send(s)} className="btn btn-outline btn-sm"
              style={{ borderRadius: 999, fontSize: 'var(--text-xs)' }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {messages.map((m, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%', padding: '10px 14px', borderRadius: 14,
            background: m.role === 'user' ? 'var(--brand-primary)' : 'var(--bg-secondary)',
            color: m.role === 'user' ? 'rgb(var(--overlay-light-rgb))' : 'var(--text-primary)',
            fontSize: 'var(--text-sm)', lineHeight: 1.55, whiteSpace: 'pre-wrap',
          }}>
            {m.content}
          </div>

          {m.proposals?.map((p, pi) => (
            <AdminStepanProposal
              key={pi}
              proposal={p}
              result={m.done?.[pi]}
              onConfirm={() => confirm(i, pi, p)}
              onReject={() => reject(i, pi)}
              lang={lang}
            />
          ))}
        </div>
      ))}

      {busy && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
          {t('Стёпан смотрит данные…', "Stepan ma'lumotlarni ko'rmoqda…")}
        </div>
      )}

      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
          borderRadius: 10, background: 'var(--error-bg)', color: 'var(--error)',
          fontSize: 'var(--text-sm)', fontWeight: 600,
        }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
