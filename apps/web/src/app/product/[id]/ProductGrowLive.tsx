'use client';

import { useEffect, useState } from 'react';
import { Sprout } from 'lucide-react';

import { useLang } from '@/components/providers/LangProvider';
import type { GrowPhase } from '@/lib/grow/lifecycle';

// ══════════════════════════════════════════════════════════════════════
// «Этот лоток растёт прямо сейчас».
//
// Ферма ведёт каждую партию по датам, а человек, который эту зелень ждёт,
// видел обычную карточку товара: цена, вес, кнопка. Модуль `lib/grow/
// lifecycle` для того и написан — говорить о лотке словами клиента, а не
// гровера, — и не рендерился нигде.
//
// Блок молчит, если живой партии нет: пустая рамка «данных нет» хуже, чем
// отсутствие блока. По той же причине он не показывает ни количества
// лотков, ни себестоимости — это цифры производства.
// ══════════════════════════════════════════════════════════════════════

interface LiveBatch {
  cropType: string;
  phase: GrowPhase;
  day: number;
  totalDays: number;
  percent: number;
  readyDate: string;
  daysToNext: number;
}

const PHASE_TEXT: Record<GrowPhase, { uz: string; ru: string }> = {
  planned: { uz: 'Ekishga tayyorlanmoqda', ru: 'Готовится к посеву' },
  dark: { uz: 'Qorong\'ida unib chiqmoqda', ru: 'Прорастает в темноте' },
  light: { uz: 'Yorug\'likda o\'smoqda', ru: 'Растёт на свету' },
  ready: { uz: 'Tayyor — kesishga', ru: 'Готов к срезке' },
  harvested: { uz: 'Kesilgan', ru: 'Срезан' },
  past: { uz: 'Yangi partiya kutilmoqda', ru: 'Ждём новую партию' },
};

/** «2026-08-26» → «26 августа». Без года: партия всегда про ближайшие дни. */
function humanDate(iso: string, lang: 'ru' | 'uz'): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'long' });
}

export function ProductGrowLive({ productId }: { productId: string }) {
  // Язык подставляет сам `t`; даты форматируем на обеих ветках отдельно.
  const { t } = useLang();
  const [batch, setBatch] = useState<LiveBatch | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/content/grow-live?productId=${encodeURIComponent(productId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data?.batch) setBatch(data.batch as LiveBatch);
      })
      .catch(() => {
        // Ферма недоступна — блока просто не будет.
      });
    return () => {
      alive = false;
    };
  }, [productId]);

  if (!batch) return null;

  const phase = PHASE_TEXT[batch.phase] ?? PHASE_TEXT.light;
  const ready = batch.phase === 'ready';

  return (
    <section className="container" style={{ paddingBottom: 'var(--space-8)' }}>
      <div className="card" style={{ padding: 'var(--space-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-3)' }}>
          <Sprout size={20} style={{ color: 'var(--brand-primary)' }} />
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)' }}>
            {t('Hozir fermada', 'Сейчас на ферме')}
          </h2>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <span style={{ fontWeight: 'var(--font-semibold)' }}>{t(phase.uz, phase.ru)}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            {batch.phase === 'planned'
              ? t('Ekish yaqinda', 'Посев скоро')
              : t(`${batch.day}-kun / ${batch.totalDays}`, `День ${batch.day} из ${batch.totalDays}`)}
          </span>
        </div>

        {/* Полоса роста: тот же процент, что видит клиент в подписке, —
            путь до ГОТОВНОСТИ, а не до конца срока хранения. */}
        <div style={{ height: 8, borderRadius: 'var(--radius-full)', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
          <div style={{
            width: `${batch.percent}%`,
            height: '100%',
            background: 'var(--brand-primary)',
            transition: 'width var(--transition-slow)',
          }} />
        </div>

        <p style={{ marginTop: 'var(--space-3)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          {ready
            ? t('Kesishga tayyor — buyurtma bering', 'Готов к срезке — можно заказывать')
            : t(
              `Tayyor bo'ladi: ${humanDate(batch.readyDate, 'uz')}`,
              `Будет готов ${humanDate(batch.readyDate, 'ru')}`,
            )}
        </p>
      </div>
    </section>
  );
}
