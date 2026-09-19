'use client';

import { Fragment, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Clock } from 'lucide-react';
import { tint } from '@/lib/tint';

// Два самостоятельных виджета аналитики: здоровье склада и матрица ABC-XYZ.
// Каждый сам ходит за своими данными, поэтому в теле экрана им делать нечего.

type HealthLevel = 'ok' | 'info' | 'warning' | 'critical';

const HEALTH_COLORS: Record<HealthLevel, string> = {
  ok: 'var(--brand-primary)',
  info: 'var(--info)',
  warning: 'var(--warning)',
  critical: 'var(--error)',
};

// ══════════════════════════════════════════════════════════════════════
// ТРИ РАЗНЫХ МОЛЧАНИЯ ВИДЖЕТА, А БЫЛО ОДНО.
//
// Проверка `if (!data)` отвечает ровно на один вопрос: «уже приехало?».
// Два других случая проходили её насквозь.
//
// ЗАПРОС ОТКАЗАЛ. `useQuery` кладёт причину в `error`, а `data` остаётся
// пустым — то есть ветка загрузки и отказ выглядят ОДИНАКОВО. Человек до
// конца дня смотрит на крутящиеся часы: экран не выглядит сломанным,
// поэтому и не жалуются — просто цифр нет. Тот же вывод уже сделан на
// «Моём рейсе»: отказ двери это не «рейса нет».
//
// ОТВЕТ ПРИШЁЛ НЕ ТОТ. Пустой объект тоже объект и проверку проходит, а
// на `breakdown.stockoutScore` падает уже вся вкладка: один виджет
// уносит с собой «Аналитику» и «Сводку» целиком. Нашёл это обход
// раскладки — на заглушенной двери обе вкладки перестали открываться.
// ══════════════════════════════════════════════════════════════════════

function WidgetBox({ children }: { children: ReactNode }) {
  return (
    <div
      className="card"
      style={{
        padding: 'var(--space-4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 200,
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  );
}

/** Ещё едет. */
function Waiting() {
  return (
    <WidgetBox>
      <Clock size={24} style={{ animation: 'pulse 1.5s infinite', color: 'var(--text-muted)' }} />
    </WidgetBox>
  );
}

/** Не приехало или приехало не то — но сказано словами, а не пустотой. */
function Silent({ text }: { text: string }) {
  return (
    <WidgetBox>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          color: 'var(--text-muted)',
          fontSize: 'var(--text-sm)',
        }}
      >
        <AlertCircle size={16} /> {text}
      </span>
    </WidgetBox>
  );
}

export function HealthScoreWidget() {
  const { data, error } = useQuery<{
    healthScore: number; healthLabel: string; healthLevel: HealthLevel;
    breakdown: { stockoutScore: number; balanceScore: number; turnoverScore: number; diversityScore: number };
  }>({
    queryKey: ['admin-analytics-health'],
    queryFn: async () => {
      const res = await fetch('/api/inventory/analytics?section=health');
      if (!res.ok) throw new Error('Не удалось загрузить здоровье склада');
      return res.json();
    },
  });

  if (error) return <Silent text="Ombor salomatligi yuklanmadi" />;
  if (!data) return <Waiting />;
  // Разбор по частям рисуется четырьмя полосами; без него виджет не просто
  // неполон — он падает, унося вкладку.
  if (!data.breakdown) return <Silent text="Ombor salomatligi: javob toʻliq emas" />;

  const { healthScore, healthLabel, healthLevel, breakdown } = data;
  const healthColor = HEALTH_COLORS[healthLevel] ?? HEALTH_COLORS.ok;
  const circumference = 2 * Math.PI * 45;
  const progress = (healthScore / 100) * circumference;

  return (
    <div className="card" style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
      <h4 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
        Ombor salomatligi
      </h4>
      {/* Radial gauge */}
      <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto var(--space-3)' }}>
        <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r="45" fill="none" stroke="var(--bg-tertiary)" strokeWidth="8" />
          <circle cx="50" cy="50" r="45" fill="none" stroke={healthColor} strokeWidth="8"
            strokeDasharray={circumference} strokeDashoffset={circumference - progress}
            strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-2xl)', color: healthColor }}>{healthScore}</span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>/100</span>
        </div>
      </div>
      <div style={{ padding: '4px 12px', borderRadius: 'var(--radius-full)', background: `color-mix(in srgb, ${healthColor} 12%, transparent)`, color: healthColor, fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', display: 'inline-block', marginBottom: 'var(--space-3)' }}>
        {healthLabel}
      </div>
      {/* Breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', textAlign: 'left' }}>
        {[
          { label: 'Mavjudlik', score: breakdown.stockoutScore, max: 25 },
          { label: 'Balans', score: breakdown.balanceScore, max: 25 },
          { label: 'Aylanma', score: breakdown.turnoverScore, max: 25 },
          { label: 'Xilma-xillik', score: breakdown.diversityScore, max: 25 },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', width: 70 }}>{item.label}</span>
            <div style={{ flex: 1, height: 4, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(item.score / item.max) * 100}%`, background: healthColor, borderRadius: 'var(--radius-full)' }} />
            </div>
            <span style={{ fontSize: '10px', fontWeight: 'var(--font-bold)', width: 30, textAlign: 'right' }}>{item.score}/{item.max}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// ABC-XYZ Matrix Widget
// ==========================================
export function ABCXYZWidget() {
  const { data, error } = useQuery<{ classSummary: Record<string, number>; totalRevenue: number }>({
    queryKey: ['admin-analytics-abcxyz'],
    queryFn: async () => {
      const res = await fetch('/api/inventory/analytics?section=abcxyz');
      if (!res.ok) throw new Error('Не удалось загрузить матрицу ABC-XYZ');
      return res.json();
    },
  });

  if (error) return <Silent text="ABC-XYZ matritsa yuklanmadi" />;
  if (!data) return <Waiting />;
  // Вся матрица — это девять чисел из `classSummary`. Без него рисовать
  // нечего, а читать из него — не с чего.
  if (!data.classSummary) return <Silent text="ABC-XYZ: javob toʻliq emas" />;

  const { classSummary } = data;
  // Девять классов ABC-XYZ должны читаться как девять РАЗНЫХ ячеек, поэтому
  // здесь категориальная палитра --cat-*, а не статусные --success/--warning:
  // те дали бы одинаковый цвет соседним классам и матрица потеряла бы смысл.
  const matrixColors: Record<string, string> = {
    AX: 'var(--cat-10)', AY: 'var(--cat-7)', AZ: 'var(--cat-12)',
    BX: 'var(--cat-5)', BY: 'var(--cat-1)', BZ: 'var(--cat-4)',
    CX: 'var(--cat-6)', CY: 'var(--cat-2)', CZ: 'var(--cat-8)',
  };
  const matrixLabels: Record<string, string> = {
    AX: 'Ideal', AY: 'Yaxshi', AZ: 'Ehtiyot',
    BX: 'Stabil', BY: "O'rtacha", BZ: 'Beqaror',
    CX: 'Kam daromad', CY: 'Zaif', CZ: 'Xavfli',
  };

  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <h4 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
        ABC-XYZ Matritsa
      </h4>
      {/* Обёртка прокрутки: четыре колонки с суммами не помещаются на телефоне,
          а .admin-main их бы просто срезал. */}
      <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: 2, minWidth: 320 }}>
        {/* Header */}
        <div />
        {['X', 'Y', 'Z'].map(x => (
          <div key={x} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 'var(--font-bold)', color: 'var(--text-muted)', padding: '4px' }}>{x}</div>
        ))}
        {/* Rows */}
        {['A', 'B', 'C'].map(abc => (
          // Ключ — на самом ФРАГМЕНТЕ, а не на первом его ребёнке: список
          // строит именно фрагмент, и React ругался про «unique key prop»
          // на каждую отрисовку матрицы, хотя внутри ключи были.
          <Fragment key={abc}>
            <div style={{ fontSize: '10px', fontWeight: 'var(--font-bold)', color: 'var(--text-muted)', padding: '8px 6px', display: 'flex', alignItems: 'center' }}>{abc}</div>
            {['X', 'Y', 'Z'].map(xyz => {
              const cls = `${abc}${xyz}`;
              const count = classSummary[cls] || 0;
              return (
                <div key={cls} style={{
                  background: count > 0 ? tint(matrixColors[cls]) : 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-sm)', padding: 'var(--space-2)',
                  textAlign: 'center', border: count > 0 ? `1px solid ${tint(matrixColors[cls], 28)}` : '1px solid transparent',
                }}>
                  <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)', color: matrixColors[cls] }}>{count}</div>
                  <div style={{ fontSize: '8px', color: 'var(--text-muted)' }}>{matrixLabels[cls]}</div>
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      </div>
      <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        <b>A</b> = yuqori daromad, <b>B</b> = o&apos;rtacha, <b>C</b> = past<br />
        <b>X</b> = barqaror talab, <b>Y</b> = o&apos;zgaruvchan, <b>Z</b> = beqaror
      </div>
    </div>
  );
}
