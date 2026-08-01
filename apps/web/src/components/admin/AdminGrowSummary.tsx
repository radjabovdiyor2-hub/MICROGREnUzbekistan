'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Leaf, Moon, Sun } from 'lucide-react';
import { fetchBatches, getBatchStatus, type Batch } from './growingData';

// ══════════════════════════════════════════════════════════════════════
// Полоса «Посадки» на дашборде. Вынесено из AdminStats, где эта секция
// была самовызывающейся функцией прямо в JSX, обёрнутой в try/catch:
// такой catch глушил не только разбор данных, но и ошибки рендера.
//
// Заодно исправлен источник: секция читала localStorage по ключу
// mg_grow_batches, а партии давно живут в таблице grow_batches (см.
// growingData.ts). После переноса полоса всегда показывала пустоту.
// Фазу считает getBatchStatus — та же функция, что и вкладка «Посадки»,
// вместо третьей копии той же арифметики.
// ══════════════════════════════════════════════════════════════════════

interface Summary {
  dark: number;
  light: number;
  ready: number;
  expired: number;
  expiredLoss: number;
  total: number;
}

function summarize(batches: Batch[]): Summary {
  const counts = { dark: 0, light: 0, ready: 0, expired: 0, expiredLoss: 0 };
  for (const batch of batches) {
    const { status } = getBatchStatus(batch);
    if (status === 'dark') counts.dark++;
    else if (status === 'light') counts.light++;
    else if (status === 'ready') counts.ready++;
    else if (status === 'expired') {
      counts.expired++;
      counts.expiredLoss += (batch.costPrice || 0) * (batch.harvestQty || batch.trays);
    }
  }
  return { ...counts, total: counts.dark + counts.light + counts.ready + counts.expired };
}

const chipStyle = (bg: string, color: string) => ({
  padding: '4px 10px', borderRadius: 'var(--radius-full)', background: bg, color,
  fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)',
  display: 'flex', alignItems: 'center', gap: '4px',
});

export function AdminGrowSummary({ fmt }: { fmt: (n: number) => string }) {
  const [batches, setBatches] = useState<Batch[]>([]);

  const load = useCallback(async () => {
    try {
      setBatches(await fetchBatches());
    } catch (err) {
      // Партии — не главный блок дашборда: сеть отвалилась, полоса просто
      // не появится, остальные показатели останутся на месте.
      console.warn('Не удалось загрузить партии посадок:', err);
      setBatches([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => summarize(batches), [batches]);

  if (summary.total === 0) return null;

  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)' }}>
        <Leaf size={16} /> Посадки ({summary.total} активных)
      </h3>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {summary.dark > 0 && (
          <span style={chipStyle('color-mix(in srgb, var(--cat-1) 12%, transparent)', 'var(--cat-1)')}>
            <Moon size={12} /> Темно: {summary.dark}
          </span>
        )}
        {summary.light > 0 && (
          <span style={chipStyle('var(--warning-bg)', 'var(--warning)')}>
            <Sun size={12} /> На свету: {summary.light}
          </span>
        )}
        {summary.ready > 0 && (
          <span style={chipStyle('var(--success-bg)', 'var(--success)')}>
            <CheckCircle size={12} /> Готовы: {summary.ready}
          </span>
        )}
        {summary.expired > 0 && (
          <span style={chipStyle('var(--error-bg)', 'var(--error)')}>
            <AlertTriangle size={12} /> Просрочено: {summary.expired} (убыток {fmt(summary.expiredLoss)} сум)
          </span>
        )}
      </div>
    </div>
  );
}
