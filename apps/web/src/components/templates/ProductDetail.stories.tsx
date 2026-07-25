import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ShoppingCart, Leaf } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

// Tier-3 reference screen — the Figma "Product detail page" (node 1:534) rebuilt
// on OUR design system: tokens + primitives + brand, responsive via Tailwind
// utilities. Composition matches the mockup (nav → 2-col hero → related grid →
// footer); the generic monochrome styling + stock photos are adapted to the brand.
const meta: Meta = {
  title: 'Templates/Product Detail',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

const RELATED = [
  { name: 'Горох', desc: 'Сладкие ростки, приятно хрустят', price: '28 000' },
  { name: 'Редис', desc: 'Острый акцент к салату', price: '30 000' },
  { name: 'Подсолнечник', desc: 'Ореховый вкус, много белка', price: '35 000' },
  { name: 'Базилик', desc: 'Ароматная пряная зелень', price: '40 000' },
  { name: 'Кресс-салат', desc: 'Пикантная горчинка', price: '26 000' },
  { name: 'Амарант', desc: 'Яркий цвет, нежный вкус', price: '38 000' },
];

const NavBar = () => (
  <header style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
    <div
      className="flex items-center justify-between"
      style={{ maxWidth: 'var(--max-width)', margin: '0 auto', padding: 'var(--space-4)' }}
    >
      <span className="font-display" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-lg)' }}>
        <Leaf size={20} style={{ color: 'var(--brand-primary)' }} /> Microgreen
      </span>
      <nav className="flex items-center" style={{ gap: 'var(--space-5)' }}>
        <a className="hidden md:inline text-text-secondary" href="#">Каталог</a>
        <a className="hidden md:inline text-text-secondary" href="#">Рецепты</a>
        <a className="hidden md:inline text-text-secondary" href="#">О нас</a>
        <Button size="sm">Войти</Button>
      </nav>
    </div>
  </header>
);

const SiteFooter = () => (
  <footer className="footer">
    <div className="footer__inner">
      <div>
        <div className="footer__section-title">Microgreen</div>
        <p className="text-text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
          Свежая срезка каждый день в Ташкенте.
        </p>
      </div>
      <div>
        <div className="footer__section-title">Каталог</div>
        <ul className="footer__links">
          <li><a href="#">Микрозелень</a></li>
          <li><a href="#">Наборы</a></li>
          <li><a href="#">Оборудование</a></li>
        </ul>
      </div>
      <div>
        <div className="footer__section-title">Компания</div>
        <ul className="footer__links">
          <li><a href="#">О нас</a></li>
          <li><a href="#">Доставка</a></li>
          <li><a href="#">Контакты</a></li>
        </ul>
      </div>
    </div>
    <div className="footer__copyright">© 2026 Microgreen Uzbekistan</div>
  </footer>
);

export const Default: Story = {
  render: () => (
    <div style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', minHeight: '100vh' }}>
      <NavBar />

      <main style={{ maxWidth: 'var(--max-width)', margin: '0 auto', padding: 'var(--space-8) var(--space-4)' }}>
        {/* Product hero — 2 columns on md+, stacked on mobile */}
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 'var(--space-8)', alignItems: 'start' }}>
          <div style={{ position: 'relative', aspectRatio: '1', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'linear-gradient(135deg, var(--brand-primary-light), var(--bg-tertiary))' }}>
            <span style={{ position: 'absolute', top: 'var(--space-3)', left: 'var(--space-3)' }}>
              <Badge variant="accent">Хит недели</Badge>
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <span className="text-text-muted" style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Микрозелень</span>
            <h1 className="font-display" style={{ fontSize: 'var(--text-4xl)', fontWeight: 'var(--font-extrabold)', lineHeight: 1.1 }}>Руккола</h1>
            <p className="text-text-secondary" style={{ fontSize: 'var(--text-lg)' }}>Пряная зелень с ореховым акцентом. Срезаем в день доставки.</p>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
              <span className="font-display text-brand-primary" style={{ fontSize: 'var(--text-3xl)', fontWeight: 'var(--font-extrabold)' }}>32 000 сум</span>
              <span className="text-text-muted" style={{ fontSize: 'var(--text-base)', textDecoration: 'line-through' }}>38 000</span>
            </div>

            <p className="text-text-secondary" style={{ lineHeight: 1.6 }}>
              В 4–40 раз больше витаминов, чем во взрослых растениях. Богата витамином K, C и фолиевой
              кислотой — идеальна для салатов, боулов и смузи.
            </p>

            <div style={{ maxWidth: 360 }}>
              <Button block leftIcon={<ShoppingCart size={18} />}>В корзину</Button>
            </div>
            <p className="text-text-muted" style={{ fontSize: 'var(--text-sm)' }}>
              Бесплатная доставка от 150 000 сум • Оплата при получении
            </p>
          </div>
        </div>

        {/* Related products */}
        <h2 className="section-title" style={{ marginTop: 'var(--space-16)', marginBottom: 'var(--space-6)' }}>Похожие товары</h2>
        <div className="product-grid">
          {RELATED.map((p) => (
            <div key={p.name} className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ aspectRatio: '4 / 3', background: 'linear-gradient(135deg, var(--brand-primary-light), var(--bg-tertiary))' }} />
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <span style={{ fontWeight: 'var(--font-semibold)' }}>{p.name}</span>
                <span className="text-text-secondary" style={{ fontSize: 'var(--text-sm)' }}>{p.desc}</span>
                <span className="font-display text-brand-primary" style={{ fontWeight: 'var(--font-bold)', marginTop: 'var(--space-1)', whiteSpace: 'nowrap' }}>{p.price} сум</span>
              </div>
            </div>
          ))}
        </div>
      </main>

      <SiteFooter />
    </div>
  ),
};
