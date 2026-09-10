import Link from 'next/link';
import { Boxes, CalendarClock, Snowflake, FileText, Truck, PackageCheck } from 'lucide-react';

import { getNumber, getSetting } from '@/lib/settings/store';
import { GROW_TO_ORDER_DAYS } from '@/lib/site';

// ══════════════════════════════════════════════════════════════════════
// Ответы на вопросы закупщика — до формы, а не после разговора.
//
// ЧТО БЫЛО. Страница отвечала на один вопрос: «с вами можно работать
// регулярно?». Всё остальное закупщик узнавал, только написав в форму и
// дождавшись менеджера. Часть не дожидалась.
//
// ЧТО ЗДЕСЬ ЕСТЬ И ЧЕГО НЕТ. Публикуем только то, что не зависит от
// загрузки теплицы: фасовку, срок, хранение, дни, стоимость доставки,
// прайс. ОБЪЁМ И ЦЕНУ по-прежнему называет менеджер — это осознанное
// решение владельца, и нарушать его страница не должна.
//
// Числа берутся из настроек, а не пишутся здесь: минимальный заказ и час
// отсечки владелец меняет сам, не дожидаясь выкатки.
// ══════════════════════════════════════════════════════════════════════

/** Условия хранения. Числа — из карточки товара, чтобы не разойтись с ней. */
const STORAGE_C = '2–5 °C';

function money(sum: number): string {
  return `${sum.toLocaleString('ru-RU')} сум`;
}

export async function B2bTerms() {
  const [minOrder, cutoffHour, deliveryFee, freeThreshold, timePromise] = await Promise.all([
    getNumber('b2b.minOrder'),
    getNumber('b2b.orderCutoffHour'),
    getNumber('delivery.fee'),
    getNumber('delivery.freeThreshold'),
    getSetting('delivery.timePromise'),
  ]);

  const items = [
    {
      icon: <Boxes size={20} />,
      title: 'Минимальный заказ',
      // Ноль означает «минимума нет», а не «мы забыли заполнить». Пишем
      // это словами: пустое место закупщик прочитает как «сейчас узнаю у
      // менеджера», то есть как отсутствие ответа.
      text: minOrder > 0
        ? `От ${money(minOrder)} на поставку.`
        : 'Минимальной суммы нет — возим и небольшие партии.',
    },
    {
      icon: <CalendarClock size={20} />,
      title: 'Когда заказать',
      text: `Заказ до ${cutoffHour}:00 попадает в срезку следующего дня. `
        + `Новый сорт под заказ растёт ${GROW_TO_ORDER_DAYS} дней.`,
    },
    {
      icon: <Snowflake size={20} />,
      title: 'Как хранить',
      text: `${STORAGE_C} в холодильнике, не мыть до подачи. `
        + 'Микрозелень не нагревать выше 70 °C — теряет вкус и витамин C.',
    },
    {
      icon: <Truck size={20} />,
      title: 'Доставка',
      text: `По Самарканду за ${String(timePromise)} минут. `
        + `${money(deliveryFee)}, бесплатно от ${money(freeThreshold)}.`,
    },
    {
      icon: <FileText size={20} />,
      title: 'Прайс',
      // Файл лежит в public и отдаётся публично, но до сих пор на него не
      // вело НИ ОДНОЙ ссылки во всём приложении.
      text: 'Полный прайс с ценами и фасовкой — открытым файлом, без заявки.',
      href: '/catalog/price-list.html',
      hrefLabel: 'Открыть прайс',
    },
    {
      icon: <PackageCheck size={20} />,
      title: 'Пробный набор',
      text: 'Соберём набор под вашу кухню, чтобы попробовать до договора. '
        + 'Напишите об этом в заявке ниже.',
    },
  ];

  return (
    <section style={{ marginTop: 'var(--space-8)' }}>
      <h2 style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xl)' }}>
        Условия работы
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
        Ish shartlari
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 'var(--space-4)',
          marginTop: 'var(--space-4)',
        }}
      >
        {items.map((it) => (
          <div key={it.title} className="card" style={{ padding: 'var(--space-4)' }}>
            <span style={{ color: 'var(--brand-primary)' }}>{it.icon}</span>
            <h3 style={{ fontWeight: 'var(--font-semibold)', marginTop: 'var(--space-2)' }}>
              {it.title}
            </h3>
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                marginTop: 4,
                lineHeight: 1.5,
              }}
            >
              {it.text}
            </p>
            {it.href && (
              <Link
                href={it.href}
                target="_blank"
                style={{
                  display: 'inline-block',
                  marginTop: 'var(--space-2)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--brand-primary)',
                  fontWeight: 600,
                }}
              >
                {it.hrefLabel} →
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
