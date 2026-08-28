'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sprout } from 'lucide-react';
import type { DemandSignal, SowingNeed } from '@/lib/forecast/demand';

// ══════════════════════════════════════════════════════════════════════
// Что сеять под ожидаемый спрос.
//
// ГЛАВНОЕ ЗДЕСЬ — НЕ ЧИСЛО, А ЕГО НАДЁЖНОСТЬ. Цикл выращивания неделя и
// больше, ускорить его нельзя, поэтому сеять приходится раньше, чем
// приходит заказ. Но прогноз на короткой истории врёт, и число без
// оговорки опаснее его отсутствия: под него посеют.
//
// Поэтому рядом с каждой строкой видно, из скольких заведений она
// сложилась и насколько ровно те заказывают. Разброс выше половины
// интервала — это уже не ритм, и строка помечается как ненадёжная.
// ══════════════════════════════════════════════════════════════════════

/** Выше этого разброса ритм считается рваным, а прогноз — догадкой. */
const SHAKY_SPREAD = 0.5;

interface Props {
  /**
   * Необязателен: вкладка посадок одноязычная по решению владельца
   * (см. ROADMAP, «Решено НЕ делать»), и навязывать ей переключение
   * языка ради одного блока незачем.
   */
  lang?: 'ru' | 'uz';
}

export function AdminSowingForecast({ lang = 'ru' }: Props) {
  const t = (ru: string, uz: string) => (lang === 'uz' ? uz : ru);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-sowing-forecast'],
    queryFn: async () => {
      const res = await fetch('/api/admin/grow-batches?forecast=1', {
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (json.status === 'ok') {
        return json as { horizonDays: number; signals: DemandSignal[]; sowing: SowingNeed[] };
      }
      throw new Error(json.error || 'Не удалось загрузить');
    },
  });

  if (isLoading || !data) return null;

  if (data.sowing.length === 0) {
    return (
      <div className="card" style={{ padding: 'var(--space-4)', borderRadius: 14 }}>
        <Header t={t} />
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
          {t(
            'Пока не из чего считать: ритм виден только у заведений с тремя и более заказами одной культуры. По двум заказам это совпадение, а не ритм.',
            "Hisoblash uchun ma'lumot yetarli emas: ritm uchta va undan ortiq buyurtma kerak.",
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 'var(--space-4)', borderRadius: 14 }}>
      <Header t={t} />

      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 8 }}>
        {t(`Ожидается за ${data.horizonDays} дн.`, `${data.horizonDays} kun ichida kutilmoqda`)}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        {data.sowing.map((need) => {
          const shaky = need.worstSpread > SHAKY_SPREAD;
          return (
            <div
              key={need.productName}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: 'var(--space-3)',
                alignItems: 'center',
                fontSize: 'var(--text-xs)',
              }}
            >
              <span>{need.productName}</span>
              <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {need.venues} {t('заведений', 'mijoz')}
              </span>
              <span
                style={{
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  minWidth: 74,
                  textAlign: 'right',
                  color: shaky ? 'var(--warning)' : 'var(--text-primary)',
                }}
                title={
                  shaky
                    ? t('Ритм рваный — число ориентировочное', 'Ritm notekis')
                    : t('Ритм ровный', 'Ritm tekis')
                }
              >
                {Math.round(need.quantity * 10) / 10}
                {shaky ? ' ?' : ''}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.45 }}>
        {t(
          'Считается по прошлым заказам, а не по обещаниям. Знак «?» — у заведений рваный ритм, и число стоит проверить звонком, а не сеять вслепую.',
          "O'tgan buyurtmalar bo'yicha hisoblanadi. «?» — ritm notekis, qo'ng'iroq qilib aniqlang.",
        )}
      </div>
    </div>
  );
}

function Header({ t }: { t: (ru: string, uz: string) => string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 'var(--space-3)',
        color: 'var(--brand-primary)',
      }}
    >
      <Sprout size={18} />
      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>
        {t('Что сеять под спрос', "Talabga ko'ra ekish")}
      </span>
    </div>
  );
}
