import type { Metadata } from 'next';
import { Clock, Leaf, Snowflake, Truck } from 'lucide-react';

import { jsonLdScript, breadcrumbList, SITE_DOMAIN } from '@/lib/seo/jsonLd';

import { loadB2bFacts } from '@/lib/b2b/facts';
import { listDishesWithGreens } from '@/lib/recipes';

import { B2bCrops, loadCrops } from './B2bCrops';
import { B2bDishes } from './B2bDishes';
import { B2bFacts } from './B2bFacts';
import { B2bTerms } from './B2bTerms';
import { LeadForm } from './LeadForm';

// ══════════════════════════════════════════════════════════════════════
// Поставки ресторанам и кафе.
//
// Весь контур HoReCa офиса — ночной сбор заведений, утренние коммерческие
// предложения, воронка B2B — работал только с теми, кого нашли сами.
// Ресторан, который пришёл на сайт, оставить заявку не мог: `POST /api/leads`
// существовал и не вызывался ниоткуда, формы не было ни одной.
//
// ЧТО ОБЕЩАЕМ, А ЧТО ОСТАВЛЯЕМ МЕНЕДЖЕРУ. Здесь стояло, что чисел не будет
// вовсе: их называет менеджер, глядя на загрузку теплицы. Для ОБЪЁМА И
// ЦЕНЫ это по-прежнему так и остаётся правилом.
//
// Но закупщик задаёт шесть вопросов, и пять из них от загрузки теплицы не
// зависят: ассортимент, фасовка, срок, хранение, стоимость доставки,
// прайс. Раньше ответа не было ни на один — человек писал в форму и ждал.
// Часть не дожидалась. Теперь ответы стоят до формы, а объём и цена
// по-прежнему за менеджером.
// ══════════════════════════════════════════════════════════════════════

export const revalidate = 3600;

const URL = `${SITE_DOMAIN}/b2b`;
const DESCRIPTION =
  'Поставки микрозелени, бейби-листа и салатов ресторанам, кафе и отелям Самарканда. '
  + 'Регулярная срезка под заказ, доставка по графику заведения.';

export const metadata: Metadata = {
  title: 'Restoranlar uchun yetkazib berish — B2B | Microgreen Uzbekistan',
  description: DESCRIPTION,
  keywords: [
    'restoranlar uchun mikroko\'kat', 'B2B yetkazib berish Samarqand',
    'oshxona uchun yashil', 'микрозелень для ресторанов', 'поставки в кафе Самарканд',
    'бейби лист оптом', 'салаты для ресторана',
  ],
  alternates: { canonical: URL },
  openGraph: {
    title: 'Поставки зелени ресторанам и кафе | Microgreen Uzbekistan',
    description: DESCRIPTION,
    url: URL,
    type: 'website',
    siteName: 'Microgreen Uzbekistan',
  },
};

const POINTS = [
  {
    icon: <Leaf size={22} />,
    uz: 'Buyurtma ostida kesiladi',
    ru: 'Срезаем под заказ',
    descUz: 'Yig\'ib qo\'yilgan emas — sizning kuningizga qarab kesamiz.',
    descRu: 'Не с полки: срезка привязана к дню вашей поставки.',
  },
  {
    icon: <Clock size={22} />,
    uz: 'Doimiy jadval',
    ru: 'Постоянный график',
    descUz: 'Haftaning belgilangan kunlari — oshxona rejasiga moslab.',
    descRu: 'Фиксированные дни недели — под план кухни, а не наоборот.',
  },
  {
    icon: <Snowflake size={22} />,
    uz: 'Sovuq zanjir',
    ru: 'Холодная цепочка',
    descUz: 'Kesishdan yetkazishgacha sovuqda.',
    descRu: 'От срезки до выгрузки — в холоде.',
  },
  {
    icon: <Truck size={22} />,
    uz: 'Samarqand bo\'ylab yetkazish',
    ru: 'Доставка по Самарканду',
    descUz: 'Kuryer keladi, siz kelishingiz shart emas.',
    descRu: 'Привозим сами, забирать не нужно.',
  },
];

/**
 * Отказ базы не должен ронять страницу для закупщиков.
 *
 * Ассортимент и факты — дополнение: без них остаются условия работы,
 * ссылка на прайс и форма заявки, то есть страница делает своё дело.
 * Пятисотая вместо неё стоила бы заявки, а не двух блоков.
 */
async function orEmpty<T>(load: () => Promise<T>, fallback: T, what: string): Promise<T> {
  try {
    return await load();
  } catch (error: unknown) {
    console.error(`[b2b] не удалось загрузить ${what}:`, error);
    return fallback;
  }
}

export default async function B2BPage() {
  // Параллельно: ассортимент и факты друг от друга не зависят.
  const [crops, facts, dishes] = await Promise.all([
    orEmpty(loadCrops, [], 'ассортимент'),
    orEmpty(loadB2bFacts, { venues: 0, since: null, weeklyDeliveries: 0 }, 'факты'),
    orEmpty(() => listDishesWithGreens(6), [], 'блюда'),
  ]);

  const breadcrumb = breadcrumbList([
    { name: 'Bosh sahifa', url: '/' },
    { name: 'Restoranlarga yetkazib berish', url: '/b2b' },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }}
      />

      <section className="container" style={{ paddingTop: 'var(--space-8)', paddingBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 'var(--font-bold)', letterSpacing: '-0.025em', marginBottom: 8 }}>
          Restoranlar va kafelar uchun
        </h1>
        <p style={{ fontSize: 'var(--text-lg)', color: 'var(--text-secondary)', maxWidth: '60ch' }}>
          Поставки микрозелени, бейби-листа и салатов заведениям Самарканда.
          Срезка под ваш график, доставка своим курьером.
        </p>
      </section>

      <section className="container" style={{ paddingBottom: 'var(--space-8)' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-8)',
        }}>
          {POINTS.map((p) => (
            <div key={p.ru} className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ color: 'var(--brand-primary)', marginBottom: 'var(--space-2)' }}>{p.icon}</div>
              <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 2 }}>{p.uz}</h3>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 6 }}>{p.ru}</div>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{p.descRu}</p>
            </div>
          ))}
        </div>

        {/* Порядок намеренный: сначала ЧТО есть, потом НА КАКИХ условиях,
            потом чем это подтверждается, и только затем форма. Заявка,
            стоящая раньше ответов, собирает вопросы вместо заказов. */}
        <B2bCrops groups={crops} />

        <B2bDishes dishes={dishes} />

        <B2bTerms />

        <B2bFacts facts={facts} />

        <div style={{ maxWidth: 560, margin: 'var(--space-8) auto 0' }}>
          <LeadForm />
        </div>
      </section>
    </>
  );
}
