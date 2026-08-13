import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@repo/database';
import { jsonLdScript, breadcrumbList, collectionPage, SITE_DOMAIN } from '@/lib/seo/jsonLd';
import { BalansSubscribe, type BalansProduct } from '@/components/balans/BalansSubscribe';

// Страница метода «Avval yashil / Сначала зелень» и единственный вход в подписку.
//
// Здесь продаётся ПОРЯДОК ПОДАЧИ, а не медицинский эффект: зелень съедают до
// основного блюда. Никаких утверждений о лечебных или оздоровительных свойствах
// на этой странице быть не может — они требуют разрешения Минздрава и
// «Узстандарта», которого у компании нет.
export const revalidate = 3600;

const URL = `${SITE_DOMAIN}/balans`;
const H1_UZ = 'Avval yashil — BALANS usuli';
const H1_RU = 'Сначала зелень — метод BALANS';
const DESCRIPTION =
  'Метод BALANS: упаковку микрозелени съедают за 10–15 минут до основного блюда. '
  + 'Готовые миксы 100 г и киты с заправкой, подписка с доставкой по Самарканду.';

export const metadata: Metadata = {
  title: 'BALANS — метод «сначала зелень» и подписка на миксы микрозелени',
  description: DESCRIPTION,
  keywords: [
    'BALANS', 'сначала зелень', 'микс микрозелени', 'подписка на зелень',
    'готовый салат Самарканд', 'мало углеводов', "avval yashil", "mikroko'kat obuna",
  ],
  alternates: { canonical: URL },
  openGraph: {
    title: 'BALANS — метод «сначала зелень» | Microgreen Uzbekistan',
    description: DESCRIPTION,
    url: URL,
    type: 'website',
    siteName: 'Microgreen Uzbekistan',
    locale: 'uz_UZ',
    alternateLocale: ['ru_RU'],
  },
};

const STEPS = [
  {
    n: '1',
    uz: "Qadoqni oching va asosiy taomdan 10-15 daqiqa OLDIN yeng.",
    ru: 'Откройте упаковку и съешьте зелень за 10–15 минут ДО основного блюда.',
  },
  {
    n: '2',
    uz: "Sousni berishdan oldin qo'shing: kislotada ko'kat bir soatda cho'kadi.",
    ru: 'Заправку добавьте перед подачей: в кислоте зелень оседает за час.',
  },
  {
    n: '3',
    uz: "Yaxshilab chaynang — mikroko'kat ta'mi to'qima buzilganda ochiladi.",
    ru: 'Жуйте тщательно — вкус микрозелени раскрывается при разрушении ткани.',
  },
  {
    n: '4',
    uz: "Isitmang: 70 °C dan yuqorida C vitamini va mirozinaza parchalanadi.",
    ru: 'Не нагревайте: выше 70 °C разрушаются витамин C и мирозиназа.',
  },
];

export default async function BalansPage() {
  let products: BalansProduct[] = [];
  try {
    products = await prisma.product.findMany({
      where: { isActive: true, category: { slug: 'balans' } },
      select: { id: true, nameUz: true, nameRu: true, price: true, unit: true },
      orderBy: { price: 'asc' },
    });
  } catch {
    /* БД недоступна на этапе сборки — страница остаётся с текстом метода */
  }

  const ld = [
    breadcrumbList([
      { name: 'Bosh sahifa · Главная', url: '/' },
      { name: 'BALANS', url: '/balans' },
    ]),
    collectionPage({
      name: H1_RU,
      description: DESCRIPTION,
      url: URL,
      items: products.map((p) => ({ url: '/catalog/balans', name: p.nameRu })),
    }),
  ];

  return (
    <>
      {ld.map((data, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />
      ))}

      <section className="container" style={{ paddingTop: 'var(--space-6)' }}>
        <nav aria-label="breadcrumb" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
          <Link href="/" style={{ color: 'inherit' }}>Главная</Link>
          {' / '}
          <span style={{ color: 'var(--text-primary)' }}>BALANS</span>
        </nav>

        <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, lineHeight: 1.15, marginBottom: 'var(--space-2)' }}>
          {H1_UZ}
        </h1>
        <p style={{ fontSize: 'var(--text-lg)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
          {H1_RU}
        </p>
        <div style={{ maxWidth: 760, color: 'var(--text-secondary)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <p>
            BALANS — bu tayyor mikroko&apos;kat mikslari 100 g qadoqda va sous sashesi bilan kitlar.
            Gap qadoqda emas, berish tartibida: ko&apos;katni palov, lag&apos;mon yoki non oldidan yeyishadi.
            Har bir qadoqda kaloriya, uglevod va tolalar yozilgan.
          </p>
          <p>
            BALANS — готовые миксы микрозелени в упаковке 100 г и киты с заправкой в саше.
            Дело не в упаковке, а в порядке подачи: зелень съедают перед пловом, лагманом или хлебом.
            На каждой упаковке указаны калорийность, углеводы и клетчатка — состав, а не обещания.
          </p>
        </div>
      </section>

      <section className="container" style={{ paddingTop: 'var(--space-5)' }}>
        <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>
          Usul · Метод
        </h2>
        <ol style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-3)', listStyle: 'none' }}>
          {STEPS.map((s) => (
            <li key={s.n} style={{
              padding: 'var(--space-4)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)', background: 'var(--bg-primary)',
            }}>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--brand-primary)' }}>{s.n}</div>
              <p style={{ marginTop: 6 }}>{s.uz}</p>
              <p style={{ marginTop: 4, color: 'var(--text-secondary)' }}>{s.ru}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="container" style={{ paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
        <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>
          Obuna · Подписка
        </h2>
        {products.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>
            Каталог временно недоступен. Составы и цены — в{' '}
            <Link href="/catalog/balans" style={{ color: 'var(--brand-primary)' }}>разделе BALANS</Link>.
          </p>
        ) : (
          <BalansSubscribe products={products} />
        )}
        <p style={{ marginTop: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', maxWidth: 760 }}>
          Продукт не является лечебным или диетическим питанием. Состав и пищевую ценность
          каждого микса смотрите на упаковке и в{' '}
          <Link href="/catalog/balans" style={{ color: 'var(--brand-primary)' }}>карточке товара</Link>.
        </p>
      </section>
    </>
  );
}
