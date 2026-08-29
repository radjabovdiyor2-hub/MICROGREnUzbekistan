'use client';

import React, { useState } from 'react';
import { Check, Flame, Pause, Play } from 'lucide-react';
import { RHYTHMS, RHYTHM_LABELS, type Rhythm } from '@/lib/owner/practices';

interface View {
  key: string;
  title: string;
  why: string;
  rhythm: Rhythm;
  custom: boolean;
  status: string;
  note: string | null;
  videos: string[];
  progress: { streak: number; due: boolean; lastDone: string | null; total: number };
}

interface Props {
  practice: View;
  lang: 'ru' | 'uz';
  onTick: (key: string, done: boolean) => void;
  onState: (key: string, patch: { status?: string; rhythm?: string; note?: string }) => void;
}

/** Одна строка практики: отметить, раскрыть, настроить под себя. */
export function AdminPracticeRow({ practice: p, lang, onTick, onState }: Props) {
  const t = (ru: string, uz: string) => (lang === 'uz' ? uz : ru);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(p.note ?? '');

  const paused = p.status === 'paused';
  const checkable = p.rhythm !== 'principle';
  const doneNow = checkable && !p.progress.due;

  return (
    <div
      style={{
        padding: '8px 0',
        borderBottom: '1px solid var(--border)',
        opacity: paused ? 0.5 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {checkable ? (
          <button
            type="button"
            onClick={() => onTick(p.key, !doneNow)}
            aria-label={t('Отметить', 'Belgilash')}
            style={{
              flexShrink: 0,
              width: 22,
              height: 22,
              marginTop: 1,
              borderRadius: '50%',
              border: `1.5px solid ${doneNow ? 'var(--success)' : 'var(--border)'}`,
              background: doneNow ? 'var(--success)' : 'transparent',
              color: doneNow ? '#fff' : 'transparent',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              padding: 0,
            }}
          >
            <Check size={13} />
          </button>
        ) : (
          <span style={{ width: 22, flexShrink: 0 }} />
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            flex: 1,
            textAlign: 'left',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: 'var(--text-primary)',
          }}
        >
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, lineHeight: 1.35 }}>
            {p.title}
          </div>
          {!open && (
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
                lineHeight: 1.4,
                marginTop: 2,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {p.why}
            </div>
          )}
        </button>

        {p.progress.streak > 1 && (
          <span
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 'var(--text-xs)',
              color: 'var(--warning)',
              fontWeight: 700,
            }}
            title={t('Периодов подряд', 'Ketma-ket davrlar')}
          >
            <Flame size={12} /> {p.progress.streak}
          </span>
        )}
      </div>

      {open && (
        <div style={{ paddingLeft: 32, marginTop: 6 }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {p.why}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <select
              value={p.rhythm}
              onChange={(e) => onState(p.key, { rhythm: e.target.value })}
              style={{
                padding: '4px 8px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: 'var(--text-xs)',
              }}
            >
              {RHYTHMS.map((r) => (
                <option key={r} value={r}>
                  {RHYTHM_LABELS[r][lang]}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => onState(p.key, { status: paused ? 'active' : 'paused' })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {paused ? <Play size={12} /> : <Pause size={12} />}
              {paused ? t('Вернуть', 'Qaytarish') : t('Отложить', 'Keyinga')}
            </button>
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (p.note ?? '') && onState(p.key, { note })}
            placeholder={t('Как это у вас — своими словами', 'Bu sizda qanday')}
            rows={2}
            style={{
              width: '100%',
              marginTop: 8,
              padding: '6px 8px',
              borderRadius: 7,
              border: '1px solid var(--border)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-xs)',
              resize: 'vertical',
            }}
          />

          {p.videos.length > 0 && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 6 }}>
              {t('Из видео', 'Videodan')} {p.videos.map((v) => `№${v}`).join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
