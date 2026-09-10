'use client';

import Link from 'next/link';
import { ArrowRight, Leaf, CalendarClock, Snowflake } from 'lucide-react';

import { useLang } from '@/components/providers/LangProvider';

// ══════════════════════════════════════════════════════════════════════
// «Для ресторанов» — вход на /b2b с главной.
//
// ЗАЧЕМ. На страницу поставок заведениям не вело НИЧЕГО, кроме строки в
// подвале: ни шапка, ни главная, ни каталог. Закупщик, попавший на сайт,
// видел розничную витрину и уходил, не узнав, что мы возим в рестораны.
//
// Три довода, а не список услуг: закупщику нужно понять за пять секунд,
// подходим ли мы вообще, а подробности — фасовка, хранение, дни поставок
// — ждут его на самой странице.
//
// Клиентский РАДИ ЯЗЫКА: главная переключается целиком, и русский
// заголовок посреди узбекской страницы — тот самый разнобой, на который
// указал владелец. Ссылка на /b2b всё равно попадает в исходный HTML:
// Next отрисовывает клиентские компоненты на сервере тоже.
// ══════════════════════════════════════════════════════════════════════

const POINTS = [
  {
    icon: <Leaf size={18} />,
    uz: 'Buyurtma kuni kesiladi',
    ru: 'Срезаем под ваш день поставки',
  },
  {
    icon: <CalendarClock size={18} />,
    uz: 'Haftaning belgilangan kunlari',
    ru: 'Фиксированные дни недели под план кухни',
  },
  {
    icon: <Snowflake size={18} />,
    uz: 'Kesishdan tushirishgacha sovuqda',
    ru: 'Холодная цепочка — от срезки до выгрузки',
  },
];

export function RestaurantsTeaser() {
  const { t } = useLang();

  return (
    <section className="container" style={{ padding: 'var(--space-8) 0' }} id="restaurants-section">
      <div
        className="card"
        style={{
          padding: 'var(--space-6)',
          display: 'grid',
          gap: 'var(--space-5)',
        }}
      >
        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>
            {t('Restoranlar va kafelar uchun', 'Для ресторанов и кафе')}
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 'var(--font-extrabold)',
              fontSize: 'clamp(1.4rem, 3.5vw, 2rem)',
              marginTop: 4,
            }}
          >
            {t("Samarqand muassasalariga ta'minot", 'Поставки заведениям Самарканда')}
          </h2>
          <p
            style={{
              color: 'var(--text-secondary)',
              marginTop: 'var(--space-2)',
              maxWidth: '56ch',
              lineHeight: 1.6,
            }}
          >
            {t(
              "Mikroko'kat, beybi-list va salatlar — oshxonangiz jadvali bo'yicha. Qadoqlash, saqlash sharti, yetkazish kunlari va narxlar — xaridorlar sahifasida.",
              'Микрозелень, бейби-лист и салаты — по графику вашей кухни. Фасовка, условия хранения, дни поставок и прайс — на странице для закупщиков.',
            )}
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          {POINTS.map((p) => (
            <div key={p.ru} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--brand-primary)', flexShrink: 0, marginTop: 2 }}>{p.icon}</span>
              <div>
                <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)' }}>{t(p.uz, p.ru)}</div>
              </div>
            </div>
          ))}
        </div>

        <div>
          <Link
            href="/b2b"
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44 }}
          >
            {t('Restoranlar uchun shartlar', 'Условия для ресторанов')} <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
