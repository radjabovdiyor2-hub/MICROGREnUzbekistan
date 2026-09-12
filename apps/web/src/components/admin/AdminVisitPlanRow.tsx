'use client';

import { AdminVisitPlanDelete } from './AdminVisitPlanDelete';
import { AdminVisitPlanStop } from './AdminVisitPlanStop';
export type { PlanItemRow, PlanRow, PlanStopRow } from './visitPlanRowTypes';
import type { PlanRow } from './visitPlanRowTypes';

// ══════════════════════════════════════════════════════════════════════
// Один план объезда: кому, сколько выполнено и каждая остановка.
//
// Вынесено из экрана: там дата, переключатели и список планов, здесь —
// одна карточка. Разные поводы для правок.
//
// ЧТО ЗДЕСЬ ВАЖНЕЕ ВСЕГО. Не «выполнено», а ЧЕМ выполнено. Галочка сама по
// себе — это снова слово сотрудника; вес ей даёт стоящее рядом расстояние,
// на котором была поставлена отметка. Поэтому подпись подтверждения стоит
// в строке остановки, а не прячется в карточке клиента.
// ══════════════════════════════════════════════════════════════════════

/** Цвет полосы исполнения: пусто, начато, всё. */
function progressToken(done: number, total: number): string {
  if (total === 0 || done === 0) return 'var(--text-muted)';
  return done === total ? 'var(--success)' : 'var(--warning)';
}

export function AdminVisitPlanRow({
  plan,
  lang,
  date,
  onOpenCustomer,
}: {
  plan: PlanRow;
  lang: 'ru' | 'uz';
  /** Дата дня — нужна кнопке снятия объезда. */
  date: string;
  onOpenCustomer: (id: number) => void;
}) {
  const total = plan.stops.length;
  const share = total === 0 ? 0 : Math.round((plan.doneCount / total) * 100);

  return (
    <div className="card" style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <strong style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)' }}>
          {plan.assignee || (lang === 'ru' ? 'Ничей план' : 'Egasiz reja')}
        </strong>

        {/* Кто составил. «Назначен» и «собрал себе» — разные истории: во
            втором случае человек сам решил, куда ехать, и спрашивать с него
            за состав плана не за что. */}
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {plan.source === 'owner'
            ? `${lang === 'ru' ? 'назначил' : 'tayinladi'} ${plan.author}`
            : lang === 'ru'
              ? 'собрал себе'
              : 'oʻzi tuzgan'}
        </span>

        {/* Подтвердил или нет. Без этой подписи «0 из 8» читается
            одинаково и когда человек не открывал задание, и когда он
            стоит в пробке у первой точки — а это разные разговоры.
            Серым, не красным: ненажатая кнопка не проступок, связь в
            поле пропадает. */}
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {plan.acceptedAt
            ? `${lang === 'ru' ? 'принял' : 'qabul qildi'} ${new Date(plan.acceptedAt)
                .toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
            : lang === 'ru'
              ? 'не подтвердил'
              : 'tasdiqlamagan'}
        </span>

        <span
          style={{
            marginLeft: 'auto',
            fontWeight: 'var(--font-bold)',
            color: progressToken(plan.doneCount, total),
          }}
        >
          {plan.doneCount} / {total}
        </span>

        <AdminVisitPlanDelete date={date} assignee={plan.assignee} lang={lang} />
      </div>

      {/* Полоса исполнения: число читается точно, полоса — мгновенно. */}
      <div style={{ height: 6, borderRadius: 'var(--radius-full)', background: 'var(--bg-tertiary)' }}>
        <div
          style={{
            width: `${share}%`,
            height: '100%',
            borderRadius: 'var(--radius-full)',
            background: progressToken(plan.doneCount, total),
            transition: 'width var(--transition-base)',
          }}
        />
      </div>

      {/* Что взять с собой — ПЕРЕД списком точек: это первое, что нужно
          утром, у машины, а не после того как объезд закончен. Строки нет
          вовсе, когда товаров нет: пустая подпись «Взять: —» сообщала бы
          о пробеле там, где его нет — разведочный объезд это норма. */}
      {plan.items && plan.items.length > 0 && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'baseline' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {lang === 'ru' ? 'Взять с собой:' : 'Olib ketish:'}
          </span>
          {plan.items.map((item) => (
            <span
              key={item.productId}
              style={{
                fontSize: 'var(--text-xs)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
            >
              {item.name} · {item.qty}{item.unit ? ` ${item.unit}` : ''}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
        {plan.stops.map((stop, i) => (
          <AdminVisitPlanStop
            key={stop.customerId}
            stop={stop}
            index={i}
            lang={lang}
            onOpen={onOpenCustomer}
          />
        ))}
      </div>
    </div>
  );
}
