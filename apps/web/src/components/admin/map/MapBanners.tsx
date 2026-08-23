'use client';

import { AlertCircle, CloudOff, MapPin } from 'lucide-react';

import { snapshotTime } from '@/lib/customers/mapSnapshot';

import type { useCustomerMap } from './useCustomerMap';

// ══════════════════════════════════════════════════════════════════════
// Плашки над картой: работа без сети, поломка, первый запуск.
//
// Вынесены из AdminCustomerMap, когда та перешагнула 200 строк. Три
// разных состояния, и путать их нельзя: работа по снимку — не поломка, а
// «ни у кого нет координат» — не пустая база.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  lang: 'ru' | 'uz';
  m: ReturnType<typeof useCustomerMap>;
}

/**
 * Первое из сообщений об ошибке. Показываем одно: три плашки подряд
 * говорят «всё сломалось», хотя сломалось одно.
 */
function errorOf(m: ReturnType<typeof useCustomerMap>): string | null {
  return (
    m.saveError ||
    m.error?.message ||
    m.deliveryError?.message ||
    (m.tilesFailed
      ? 'Карта недоступна — тайлы не загрузились. Клиенты показаны списком ниже.'
      : null)
  );
}

const card: React.CSSProperties = {
  padding: 'var(--space-3)',
  display: 'flex',
  gap: 'var(--space-2)',
  alignItems: 'center',
};

export function MapBanners({ lang, m }: Props) {
  const { snapshotAt } = m;
  const errorText = errorOf(m);
  const { placed, total } = m.collection.summary;
  // Не «пусто», а «координат нет ни у кого»: разница видна только при
  // total > 0, иначе это просто пустая база.
  const nothingPlaced = !m.isLoading && placed === 0 && total > 0;

  return (
    <>
      {/* Связь пропала, но снимок есть: это не ошибка, а работа без сети.
          Красная плашка тут сказала бы «сломалось» про карту, по которой
          человек прямо сейчас едет. */}
      {snapshotAt !== null && (
        <div className="card" style={{ ...card, color: 'var(--warning)' }}>
          <CloudOff size={16} />
          <span style={{ fontSize: 'var(--text-sm)' }}>
            {lang === 'ru'
              ? `Связи нет — карта снята ${snapshotTime(snapshotAt)}. Точки, адреса и телефоны на месте, отметки визитов уйдут сами, когда связь вернётся.`
              : `Aloqa yoʻq — xarita ${snapshotTime(snapshotAt)} olingan. Belgilar aloqa qaytganda yuboriladi.`}
          </span>
        </div>
      )}

      {snapshotAt === null && errorText !== null && (
        <div
          className="card"
          style={{ ...card, background: 'var(--error-bg)', color: 'var(--error)' }}
        >
          <AlertCircle size={16} />
          <span style={{ fontSize: 'var(--text-sm)' }}>{errorText}</span>
        </div>
      )}

      {/* Не «пусто», а «координат нет ни у кого»: без этого экрана первый
          запуск неотличим от поломки. */}
      {nothingPlaced && (
        <div className="card" style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
          <MapPin size={28} style={{ color: 'var(--text-muted)' }} />
          <h4 style={{ marginTop: 'var(--space-2)', fontWeight: 'var(--font-semibold)' }}>
            {lang === 'ru' ? 'Ни у одного клиента нет координат' : 'Hech kimda koordinata yoʻq'}
          </h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            {lang === 'ru'
              ? 'Откройте список «Без координат» и поставьте пины вручную — начните с тех, кто платит больше.'
              : '«Koordinatasiz» roʻyxatini oching va pinlarni qoʻlda qoʻying.'}
          </p>
        </div>
      )}
    </>
  );
}
