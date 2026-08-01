'use client';

import React from 'react';
import { Sparkles, CheckCircle2, RefreshCw, AlertTriangle } from 'lucide-react';
import type { ResultStatus } from './botActions';

interface Props {
  lang: 'ru' | 'uz';
  lastResult: { action: string; status: ResultStatus; message: string } | null;
  statusColor: string;
}

export function AdminBotControlHeader({ lang, lastResult, statusColor }: Props) {
  return (
    <>
      {/* Banner */}
      <div className="card" style={{
        padding: 'var(--space-6) var(--space-6) var(--space-5)',
        background: `linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 18%, var(--bg-card)) 0%, var(--bg-card) 60%, color-mix(in srgb, var(--brand-accent) 10%, var(--bg-card)) 100%)`,
        borderColor: `color-mix(in srgb, var(--brand-primary) 35%, transparent)`,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', right: -30, top: -30, width: 200, height: 200,
          borderRadius: '50%', background: `color-mix(in srgb, var(--brand-primary) 15%, transparent)`,
          filter: 'blur(50px)', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', left: '30%', bottom: -60, width: 160, height: 160,
          borderRadius: '50%', background: `color-mix(in srgb, var(--brand-accent) 10%, transparent)`,
          filter: 'blur(60px)', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, var(--brand-primary), var(--brand-accent), var(--brand-primary))`,
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', borderRadius: 'var(--radius-full)',
            background: `color-mix(in srgb, var(--brand-primary) 15%, transparent)`,
            border: `1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)`,
            color: 'var(--brand-primary)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)',
            marginBottom: 'var(--space-3)',
          }}>
            <Sparkles size={14} />
            <span>{lang === 'ru' ? 'Пульт Управления ИИ-Офисом' : 'AI Office Boshqaruv Pult'}</span>
          </div>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)',
            fontSize: 'var(--text-2xl)', color: 'var(--text-primary)',
            margin: '0 0 var(--space-2)',
          }}>
            {lang === 'ru' ? 'Мгновенный запуск задач и функций 11 Ботов' : '11 Botlar Buyruqlarini Bajarish'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', lineHeight: 1.6, maxWidth: 640, margin: 0 }}>
            {lang === 'ru'
              ? 'Прямой запуск бекапов, отчётов, синхронизаций и петель обучения в один клик из центральной админки.'
              : 'Zahiraviy nusxa, hisobot va sinxronizatsiyani bir bosishda ishga tushirish.'}
          </p>
        </div>
      </div>

      {/* Result Toast */}
      {lastResult && (
        <div className="card" style={{
          padding: 'var(--space-4)',
          display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
          background: `color-mix(in srgb, ${statusColor} 12%, var(--bg-card))`,
          borderColor: `color-mix(in srgb, ${statusColor} 40%, transparent)`,
          color: statusColor,
        }}>
          {lastResult.status === 'ok'
            ? <CheckCircle2 size={20} style={{ flexShrink: 0, marginTop: 2 }} />
            : lastResult.status === 'pending'
              ? <RefreshCw size={20} style={{ flexShrink: 0, marginTop: 2, animation: 'spin 1s linear infinite' }} />
              : <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2 }} />}
          <div>
            <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>[{lastResult.action}]</span>
              <span style={{
                fontSize: 'var(--text-xs)', padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                background: `color-mix(in srgb, ${statusColor} 20%, transparent)`,
                fontFamily: 'monospace',
              }}>
                {lastResult.status.toUpperCase()}
              </span>
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 4 }}>
              {lastResult.message}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
