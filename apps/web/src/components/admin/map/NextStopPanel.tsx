'use client';

import { useQuery } from '@tanstack/react-query';
import { Compass, Plus } from 'lucide-react';

import { timeoutSignal } from '@/lib/net/connection';
import { readNextAnswer, type NextAnswer } from '@/lib/customers/nextStop';
import type { RoutePoint } from '@/lib/customers/dayRoute';

import { NavigateButton } from './NavigateButton';

// ══════════════════════════════════════════════════════════════════════
// «Куда дальше» — три строки, а не приказ.
//
// ПОЧЕМУ С ПРИЧИНОЙ У КАЖДОЙ. Список без причин читается как распоряжение,
// а решать должен человек: он знает про обед на кухне и про то, что к
// одним лучше заезжать с утра. Причина превращает подсказку в довод.
//
// ПОЧЕМУ ЗАПРЕТ ГОВОРИТ СЛОВАМИ. Пустая панель читается как поломка
// экрана. «Смена не начата» и «не вижу, где вы» — это руководство к
// действию, и оба этих условия человек чинит сам, кнопками рядом.
//
// ОБНОВЛЯЕТСЯ САМА, БЕЗ ОПРОСА. Кэш гасят два события: отметка визита
// (`VisitButtons`) и новая крошка трека — тему `field` публикует приёмник
// крошек, и `useRealtime` переводит её в этот ключ. Ритм задаёт работа, а
// не таймер: отметился — получил следующую.
// ══════════════════════════════════════════════════════════════════════

const text = {
  title: { ru: 'Куда дальше', uz: 'Keyin qayerga' },
  empty: { ru: 'Все ваши точки отмечены', uz: 'Barcha nuqtalaringiz belgilangan' },
  add: { ru: 'В объезд', uz: 'Aylanma' },
};

export function NextStopPanel({
  lang,
  onPick,
  onAdd,
}: {
  lang: 'ru' | 'uz';
  /** Показать точку на карте. Нет карты (экран рейса) — нет и обработчика. */
  onPick?: (point: RoutePoint) => void;
  /** Положить в объезд. У водителя объезда нет, и кнопки быть не должно. */
  onAdd?: (point: RoutePoint) => void;
}) {
  const { data } = useQuery<NextAnswer>({
    queryKey: ['staff-next'],
    queryFn: async () => {
      const res = await fetch('/api/admin/staff/day', { signal: timeoutSignal() });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Не удалось загрузить');
      // Форму проверяем, а не предполагаем — см. `readNextAnswer`.
      return readNextAnswer(body);
    },
  });

  if (!data) return null;

  return (
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 'var(--space-2)',
          fontWeight: 'var(--font-semibold)',
          fontSize: 'var(--text-sm)',
        }}
      >
        <Compass size={16} style={{ color: 'var(--brand-primary)' }} />
        {text.title[lang]}
      </div>

      {data.gate !== null && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0 }}>
          {data.gateText}
        </p>
      )}

      {data.gate === null && data.next.length === 0 && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>
          {text.empty[lang]}
        </p>
      )}

      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        {data.next.map((s) => (
          <div
            key={`${s.kind}-${s.point.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              flexWrap: 'wrap',
              padding: 'var(--space-2)',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <button
              type="button"
              onClick={() => onPick?.(s.point)}
              id={`next-stop-${s.point.id}`}
              disabled={!onPick}
              style={{
                flex: 1,
                minHeight: 44,
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                cursor: onPick ? 'pointer' : 'default',
              }}
            >
              <div style={{ fontWeight: 'var(--font-semibold)' }}>{s.point.name}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                {s.kmLabel} · {s.reason}
              </div>
            </button>

            {/* Добавить в объезд можно только клиента: адрес рейса живёт
                своим порядком, и тащить его в чужой список нельзя. */}
            {s.kind !== 'delivery' && onAdd && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => onAdd(s.point)}
                style={{ minHeight: 44 }}
              >
                <Plus size={14} /> {text.add[lang]}
              </button>
            )}

            <NavigateButton
              latitude={s.point.latitude}
              longitude={s.point.longitude}
              lang={lang}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
