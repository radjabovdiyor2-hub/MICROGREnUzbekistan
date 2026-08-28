'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Filter } from 'lucide-react';
import type { FunnelStage } from '@/lib/customers/statuses';

interface Props {
  /** Экран клиентов работает с языком, а не с готовой функцией перевода. */
  lang: 'ru' | 'uz';
}

/**
 * Воронка клиентов.
 *
 * Показывает СРЕЗ НА СЕГОДНЯ, а не переходы: истории смены статуса в базе
 * не велось, и восстановить её задним числом неоткуда. Переходы пишутся в
 * аудит начиная с внедрения — считать их можно будет, когда накопятся.
 *
 * Доля перехода у первого этапа не показывается: до него перехода нет, и
 * прочерк здесь честнее нуля.
 */
export function AdminCustomerFunnel({ lang }: Props) {
  const t = (ru: string, uz: string) => (lang === 'uz' ? uz : ru);

  // Своя загрузка, а не проброс через общий хук списка: воронка — это
  // отдельный запрос к базе, и вешать его на каждое открытие списка
  // клиентов незачем.
  const { data } = useQuery({
    queryKey: ['admin-customer-funnel'],
    queryFn: async () => {
      const res = await fetch('/api/admin/customers?funnel=1&limit=1', {
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (json.status === 'ok') return (json.funnel ?? []) as FunnelStage[];
      throw new Error(json.error || 'Не удалось загрузить');
    },
  });

  const stages = data ?? [];
  const total = stages.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return null;

  return (
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
        <Filter size={18} />
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>
          {t('Этапы клиентов', 'Mijoz bosqichlari')}
        </span>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {stages.map((stage) => (
          <div key={stage.status}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 'var(--text-xs)',
                marginBottom: 3,
              }}
            >
              <span>{stage.label}</span>
              <span style={{ color: 'var(--text-muted)' }}>
                {stage.count}
                {stage.conversion !== null && ` · ${Math.round(stage.conversion * 100)}%`}
              </span>
            </div>
            <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3 }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.round(stage.share * 100)}%`,
                  background: 'var(--brand-primary)',
                  borderRadius: 3,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.45 }}>
        {t(
          'Срез на сегодня. Переходы между этапами начали записываться недавно — накопится история, появится и она.',
          "Bugungi kesim. Bosqichlar orasidagi o'tishlar yaqinda yozila boshladi.",
        )}
      </div>
    </div>
  );
}
