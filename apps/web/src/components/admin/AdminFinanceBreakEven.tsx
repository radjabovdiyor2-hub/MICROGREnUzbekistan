'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Target } from 'lucide-react';
import type { BreakEven } from '@/lib/finance/breakEven';
import type { MarginBreakdown } from '@/lib/finance/margin';
import { AdminMarginTable } from './AdminMarginTable';

// ══════════════════════════════════════════════════════════════════════
// Точка безубыточности и разрезы маржинальности.
//
// Отдельный компонент со своей загрузкой, а не блок внутри AdminFinance:
// разбор поднимает весь реестр продаж за период, и вешать это на каждое
// открытие вкладки «Финансы» незачем.
//
// ГЛАВНОЕ ЗДЕСЬ — ЧЕСТНОСТЬ ПУСТЫХ СЛУЧАЕВ. Когда точки не существует,
// экран обязан сказать это словами. Показать вместо неё ноль или прочерк
// значит дать владельцу поверить, что всё в порядке.
// ══════════════════════════════════════════════════════════════════════

const money = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')} сум`;

interface Props {
  days: number;
  t: (ru: string, uz: string) => string;
}

export function AdminFinanceBreakEven({ days, t }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-finance-analysis', days],
    queryFn: async () => {
      const res = await fetch(`/api/admin/finance?days=${days}&analysis=1`, {
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (json.status === 'ok') return json as { breakEven: BreakEven; margin: MarginBreakdown };
      throw new Error(json.error || t('Не удалось загрузить', "Yuklab bo'lmadi"));
    },
  });

  if (isLoading) {
    return (
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        {t('Считаем…', 'Hisoblanmoqda…')}
      </div>
    );
  }

  if (!data) return null;

  const { breakEven: be, margin } = data;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div className="card" style={{ padding: 'var(--space-4)', borderRadius: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 'var(--space-3)',
            color: 'var(--brand-primary)',
          }}
        >
          <Target size={18} />
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>
            {t('Точка безубыточности', 'Zararsizlik nuqtasi')}
          </span>
        </div>

        <BreakEvenVerdict be={be} t={t} />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 'var(--space-3)',
            marginTop: 'var(--space-3)',
          }}
        >
          <Cell label={t('Постоянные расходы', "Doimiy xarajatlar")} value={money(be.fixedCosts)} />
          <Cell label={t('Выручка за период', 'Davr tushumi')} value={money(be.revenue)} />
          <Cell
            label={t('Доля маржи', 'Marja ulushi')}
            value={be.marginRate === null ? '—' : `${Math.round(be.marginRate * 100)}%`}
          />
        </div>
      </div>

      <AdminMarginTable
        title={t('Маржа по культурам', "Ekinlar bo'yicha marja")}
        rows={margin.byProduct}
        emptyHint={t('Продаж за период не было', "Davrda sotuv bo'lmagan")}
      />
      <AdminMarginTable
        title={t('Маржа по заведениям', "Mijozlar bo'yicha marja")}
        rows={margin.byCustomer}
        emptyHint={t('Продаж за период не было', "Davrda sotuv bo'lmagan")}
      />
      <AdminMarginTable
        title={t('Маржа по каналам', "Kanallar bo'yicha marja")}
        rows={margin.byChannel}
        emptyHint={t('Продаж за период не было', "Davrda sotuv bo'lmagan")}
      />
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 'var(--text-base)', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

/** Словесный ответ. Числа под ним — подтверждение, а не сам ответ. */
function BreakEvenVerdict({ be, t }: { be: BreakEven; t: Props['t'] }) {
  if (be.marginRate === null) {
    return (
      <Verdict color="var(--text-muted)">
        {t(
          'Выручки за период не было — считать не из чего.',
          "Davrda tushum bo'lmagan — hisoblash uchun ma'lumot yo'q.",
        )}
      </Verdict>
    );
  }

  if (be.revenueNeeded === null) {
    return (
      <Verdict color="var(--error)">
        {t(
          'Точка недостижима: продаём не дороже себестоимости. Рост оборота увеличит убыток, а не покроет расходы.',
          "Nuqtaga erishib bo'lmaydi: tannarxdan qimmat sotilmayapti. Aylanma o'sishi zararni oshiradi.",
        )}
      </Verdict>
    );
  }

  if (be.covered) {
    return (
      <Verdict color="var(--success)">
        {t(
          `Точка пройдена. Запас сверх неё — ${money(-(be.gap ?? 0))}.`,
          `Nuqta o'tildi. Zaxira — ${money(-(be.gap ?? 0))}.`,
        )}
      </Verdict>
    );
  }

  return (
    <Verdict color="var(--error)">
      {t(
        `Не хватает ${money(be.gap ?? 0)}. Чтобы выйти в ноль, нужна выручка ${money(be.revenueNeeded)}.`,
        `${money(be.gap ?? 0)} yetishmayapti. Nolga chiqish uchun ${money(be.revenueNeeded)} kerak.`,
      )}
    </Verdict>
  );
}

function Verdict({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color, lineHeight: 1.45 }}>
      {children}
    </div>
  );
}
