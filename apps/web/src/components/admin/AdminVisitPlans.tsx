'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, MapPinOff, RefreshCw } from 'lucide-react';

import { AdminVisitPlanRow, type PlanRow } from './AdminVisitPlanRow';

// ══════════════════════════════════════════════════════════════════════
// «Объезды за день» — экран владельца.
//
// ЗАЧЕМ. Отметки визитов писались с координатой и расстоянием, планы легли
// на сервер — но увидеть всё это можно было только открывая точки по одной
// на карте. Числа были, ответа не было.
//
// Здесь ответ виден целиком: кто куда собирался, сколько объехал и НА КАКОМ
// РАССТОЯНИИ поставил каждую отметку. Последнее и есть суть: галочка сама
// по себе — снова слово сотрудника.
//
// ЧЕГО ЗДЕСЬ НЕТ НАМЕРЕННО
//
// Кнопки «отметить выполненным». Исполнение считается по отметкам визитов
// (lib/customers/visitPlanStore), и вторая дверь к нему сделала бы план
// закрываемым из кресла — ровно тем, от чего уходили.
//
// Красных обвинений тоже нет. Цвет расстояния скупой: явное «далеко» при
// честной точности красное, «не подтверждено» и «неточно» серые. У доброй
// половины поездок GPS не берётся вовсе, и красить это обвинительным цветом
// значит однажды потерять доверие ко всему признаку разом.
// ══════════════════════════════════════════════════════════════════════

/** Сегодняшняя дата как `YYYY-MM-DD` по местному времени, а не по UTC. */
function today(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function AdminVisitPlans({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const router = useRouter();
  const [date, setDate] = useState(today());

  const { data, isLoading, refetch, isFetching } = useQuery<PlanRow[], Error>({
    queryKey: ['admin-visit-plans', date],
    queryFn: async () => {
      const res = await fetch(`/api/admin/visit-plans?date=${date}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(t('Не удалось загрузить планы', 'Rejalar yuklanmadi'));
      return (await res.json()).plans as PlanRow[];
    },
  });

  const plans = data ?? [];
  const totalStops = plans.reduce((n, p) => n + p.stops.length, 0);
  const totalDone = plans.reduce((n, p) => n + p.doneCount, 0);

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <CalendarDays size={18} style={{ color: 'var(--brand-primary)' }} />
        <input
          type="date"
          className="input"
          value={date}
          max={today()}
          onChange={(e) => setDate(e.target.value)}
          style={{ minHeight: 44, width: 'auto' }}
        />

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void refetch()}
          disabled={isFetching}
          style={{ minHeight: 44 }}
        >
          <RefreshCw size={15} className={isFetching ? 'animate-spin' : undefined} />
          {t('Обновить', 'Yangilash')}
        </button>

        {totalStops > 0 && (
          <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }}>
            {t('Всего объехано', 'Jami')}: <strong>{totalDone}</strong> / {totalStops}
          </span>
        )}
      </div>

      {isLoading && (
        <div style={{ color: 'var(--text-muted)' }}>{t('Загрузка…', 'Yuklanmoqda…')}</div>
      )}

      {!isLoading && plans.length === 0 && (
        // Пустой день — это ответ, а не сбой. Прямо говорим, откуда план
        // берётся: иначе экран выглядит сломанным.
        <div
          className="card"
          style={{
            padding: 'var(--space-6)',
            display: 'grid',
            gap: 'var(--space-2)',
            justifyItems: 'center',
            textAlign: 'center',
            color: 'var(--text-muted)',
          }}
        >
          <MapPinOff size={28} />
          <strong>{t('На этот день планов нет', 'Bu kunga reja yoʻq')}</strong>
          <span style={{ fontSize: 'var(--text-sm)' }}>
            {t(
              'План собирается на карте кнопкой «Собрать на сегодня» — продавцом себе или вами на него.',
              'Reja xaritada «Bugunga yigʻish» tugmasi bilan tuziladi.',
            )}
          </span>
        </div>
      )}

      {plans.map((plan) => (
        <AdminVisitPlanRow
          key={plan.id}
          plan={plan}
          lang={lang}
          onOpenCustomer={(id) => {
            // Точка на карте, а не строка списка: вопрос «был ли он там»
            // разрешается глазами по карте.
            //
            // `router.push`, а не `location.href`: перезагрузка страницы
            // на телефоне в поле стоит секунд и трафика, а вкладка
            // админки — обычный параметр адреса.
            router.push(`/admin?tab=customers&focus=${id}`);
          }}
        />
      ))}
    </div>
  );
}
