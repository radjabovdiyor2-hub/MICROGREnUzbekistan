'use client';

import React from 'react';
import type { BreakEven } from '@/lib/finance/breakEven';

// Словесная часть экрана безубыточности, вынесенная из AdminFinanceBreakEven:
// вместе они переваливали за предел размера компонента.
//
// ГЛАВНОЕ ЗДЕСЬ — ЧЕСТНОСТЬ ПУСТЫХ СЛУЧАЕВ. Когда точки не существует,
// экран обязан сказать это словами. Ноль или прочерк на её месте дают
// владельцу поверить, что всё в порядке.

const money = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')} сум`;

type T = (ru: string, uz: string) => string;

export function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 'var(--text-base)', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Verdict({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color, lineHeight: 1.45 }}>
      {children}
    </div>
  );
}

/** Словесный ответ. Числа под ним — подтверждение, а не сам ответ. */
export function BreakEvenVerdict({ be, t }: { be: BreakEven; t: T }) {
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
