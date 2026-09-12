import Link from 'next/link';
import { Boxes, CalendarClock, Snowflake, FileText, Truck, PackageCheck } from 'lucide-react';

import { getNumber, getSetting } from '@/lib/settings/store';
import { GROW_TO_ORDER_DAYS } from '@/lib/site';
import { Bi } from '@/components/ui/Bi';

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

function money(sum: number, lang: 'ru' | 'uz'): string {
  return `${sum.toLocaleString('ru-RU')} ${lang === 'ru' ? 'сум' : "so'm"}`;
}

export async function B2bTerms() {
  const [minOrder, cutoffHour, deliveryFee, freeThreshold, timePromise] = await Promise.all([
    getNumber('b2b.minOrder'),
    getNumber('b2b.orderCutoffHour'),
    getNumber('delivery.fee'),
    getNumber('delivery.freeThreshold'),
    getSetting('delivery.timePromise'),
  ]);

  // Заголовок и текст — ПАРОЙ на двух языках. Закупщик читает эту карточку
  // как ответ, а не как подпись к иконке: половина ответа на чужом языке
  // отправляет его в форму с тем же вопросом, ради которого блок и писали.
  const items = [
    {
      icon: <Boxes size={20} />,
      title: { ru: 'Минимальный заказ', uz: 'Minimal buyurtma' },
      // Ноль означает «минимума нет», а не «мы забыли заполнить». Пишем
      // это словами: пустое место закупщик прочитает как «сейчас узнаю у
      // менеджера», то есть как отсутствие ответа.
      text: minOrder > 0
        ? {
          ru: `От ${money(minOrder, 'ru')} на поставку.`,
          uz: `Bir yetkazishga ${money(minOrder, 'uz')} dan.`,
        }
        : {
          ru: 'Минимальной суммы нет — возим и небольшие партии.',
          uz: "Minimal summa yo'q — kichik partiyalarni ham olib boramiz.",
        },
    },
    {
      icon: <CalendarClock size={20} />,
      title: { ru: 'Когда заказать', uz: 'Qachon buyurtma berish' },
      text: {
        ru: `Заказ до ${cutoffHour}:00 попадает в срезку следующего дня. `
          + `Новый сорт под заказ растёт ${GROW_TO_ORDER_DAYS} дней.`,
        uz: `${cutoffHour}:00 gacha berilgan buyurtma ertangi kesimga tushadi. `
          + `Buyurtma ostidagi yangi nav ${GROW_TO_ORDER_DAYS} kun o'sadi.`,
      },
    },
    {
      icon: <Snowflake size={20} />,
      title: { ru: 'Как хранить', uz: 'Qanday saqlash' },
      text: {
        ru: `${STORAGE_C} в холодильнике, не мыть до подачи. `
          + 'Микрозелень не нагревать выше 70 °C — теряет вкус и витамин C.',
        uz: `Muzlatgichda ${STORAGE_C}, dasturxonga qo'yishdan oldin yuvmang. `
          + "Mikroko'katni 70 °C dan yuqori qizdirmang — ta'mi va C vitamini yo'qoladi.",
      },
    },
    {
      icon: <Truck size={20} />,
      title: { ru: 'Доставка', uz: 'Yetkazib berish' },
      text: {
        ru: `По Самарканду за ${String(timePromise)} минут. `
          + `${money(deliveryFee, 'ru')}, бесплатно от ${money(freeThreshold, 'ru')}.`,
        uz: `Samarqand bo'ylab ${String(timePromise)} daqiqada. `
          + `${money(deliveryFee, 'uz')}, ${money(freeThreshold, 'uz')} dan boshlab bepul.`,
      },
    },
    {
      icon: <FileText size={20} />,
      title: { ru: 'Прайс', uz: "Narxlar ro'yxati" },
      // Файл лежит в public и отдаётся публично, но до сих пор на него не
      // вело НИ ОДНОЙ ссылки во всём приложении.
      text: {
        ru: 'Полный прайс с ценами и фасовкой — открытым файлом, без заявки.',
        uz: "Narxlar va qadoqlash bilan to'liq ro'yxat — ochiq fayl, ariza shart emas.",
      },
      href: '/catalog/price-list.html',
      hrefLabel: { ru: 'Открыть прайс', uz: 'Narxlarni ochish' },
    },
    {
      icon: <PackageCheck size={20} />,
      title: { ru: 'Пробный набор', uz: "Sinov to'plami" },
      text: {
        ru: 'Соберём набор под вашу кухню, чтобы попробовать до договора. '
          + 'Напишите об этом в заявке ниже.',
        uz: "Shartnomagacha tatib ko'rish uchun oshxonangizga mos to'plam yig'amiz. "
          + 'Quyidagi arizada shu haqda yozing.',
      },
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
          <div key={it.title.ru} className="card" style={{ padding: 'var(--space-4)' }}>
            <span style={{ color: 'var(--brand-primary)' }}>{it.icon}</span>
            <h3 style={{ fontWeight: 'var(--font-semibold)', marginTop: 'var(--space-2)' }}>
              <Bi ru={it.title.ru} uz={it.title.uz} />
            </h3>
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                marginTop: 4,
                lineHeight: 1.5,
              }}
            >
              <Bi ru={it.text.ru} uz={it.text.uz} />
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
                <Bi ru={it.hrefLabel.ru} uz={it.hrefLabel.uz} /> →
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
