import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Search, ShoppingBag, ChevronRight } from 'lucide-react';

// Tier-3 Apple-style Shop/catalog screen (Figma "Shop", node 1:777), adapted to
// the Apple aesthetic on our design system: frosted nav, oversized hero, pill
// filter chips, clean product grid, featured split, minimal footer. Brand green
// accent. Original design (no Apple assets).
const meta: Meta = {
  title: 'Templates/Apple Shop',
  parameters: { layout: 'fullscreen', backgrounds: { disable: true } },
};
export default meta;
type Story = StoryObj;

const SF = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif";
const INK = '#1d1d1f';
const SUB = '#86868b';
const PANEL = '#f5f5f7';

const PRODUCTS = [
  { n: 'Руккола', d: 'Пряная, ореховая', p: '32 000' },
  { n: 'Горох', d: 'Сладкие ростки', p: '28 000' },
  { n: 'Редис', d: 'Острый акцент', p: '30 000' },
  { n: 'Подсолнечник', d: 'Много белка', p: '35 000' },
  { n: 'Базилик', d: 'Ароматная зелень', p: '40 000' },
  { n: 'Амарант', d: 'Яркий цвет', p: '38 000' },
];
const CHIPS = ['Всё', 'Микрозелень', 'Наборы', 'Проращивание', 'Оборудование'];

export const Default: Story = {
  render: () => (
    <div style={{ fontFamily: SF, color: INK, background: '#fff', WebkitFontSmoothing: 'antialiased' }}>
      {/* Frosted nav */}
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(255,255,255,0.72)', backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 22px', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em' }}>Microgreen</span>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            {['Магазин', 'Микрозелень', 'Наборы', 'Рецепты'].map((l) => (
              <a key={l} href="#" className="hidden md:inline" style={{ color: INK, opacity: 0.85, fontSize: 12, textDecoration: 'none' }}>{l}</a>
            ))}
            <Search size={16} style={{ opacity: 0.85 }} />
            <ShoppingBag size={16} style={{ opacity: 0.85 }} />
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '72px 22px 40px' }}>
        <p style={{ color: 'var(--brand-primary)', fontSize: 21, fontWeight: 600, marginBottom: 6 }}>Магазин</p>
        <h1 style={{ fontSize: 'clamp(40px, 7vw, 72px)', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.05, margin: 0 }}>Живая еда.</h1>
        <p style={{ fontSize: 'clamp(19px, 2.2vw, 26px)', color: SUB, marginTop: 14 }}>12 сортов. Срезка утром — доставка к обеду.</p>
      </section>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', padding: '0 22px 40px' }}>
        {CHIPS.map((c, i) => (
          <span key={c} style={{ padding: '9px 18px', borderRadius: 980, fontSize: 15, fontWeight: 500, cursor: 'pointer', background: i === 0 ? 'var(--brand-primary)' : PANEL, color: i === 0 ? '#fff' : INK }}>{c}</span>
        ))}
      </div>

      {/* Product grid */}
      <section style={{ maxWidth: 980, margin: '0 auto', padding: '0 22px', display: 'grid', gap: 22, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {PRODUCTS.map((p) => (
          <div key={p.n} style={{ background: PANEL, borderRadius: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ aspectRatio: '4 / 3', background: 'linear-gradient(160deg, var(--brand-primary-light), #eef2f5 75%)' }} />
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 21, fontWeight: 600, letterSpacing: '-0.01em' }}>{p.n}</span>
              <span style={{ color: SUB, fontSize: 16 }}>{p.d}</span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <span style={{ fontSize: 17, fontWeight: 600 }}>{p.p} сум</span>
                <a href="#" style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 16px', borderRadius: 980, background: 'var(--brand-primary)', color: '#fff', fontSize: 15, fontWeight: 500, textDecoration: 'none' }}>Купить</a>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Featured split */}
      <section style={{ maxWidth: 980, margin: '80px auto 0', padding: '0 22px' }}>
        <div style={{ background: PANEL, borderRadius: 28, padding: 'clamp(32px, 5vw, 64px)', display: 'grid', gap: 32, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', alignItems: 'center' }}>
          <div>
            <p style={{ color: 'var(--brand-primary)', fontWeight: 600, marginBottom: 8 }}>Набор новичка</p>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.08, margin: '0 0 16px' }}>Всё для первого урожая.</h2>
            <p style={{ color: SUB, fontSize: 19, marginBottom: 24 }}>Семена, лотки, инструкция. Первая срезка — через 7 дней.</p>
            <a href="#" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 22px', borderRadius: 980, background: 'var(--brand-primary)', color: '#fff', fontSize: 17, fontWeight: 500, textDecoration: 'none' }}>Собрать набор <ChevronRight size={16} /></a>
          </div>
          <div style={{ aspectRatio: '4 / 3', borderRadius: 20, background: 'linear-gradient(160deg, var(--brand-primary-light), #eef2f5 75%)' }} />
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: '#f5f5f7', color: SUB, fontSize: 12, padding: '40px 22px', marginTop: 80 }}>
        <div style={{ maxWidth: 980, margin: '0 auto', borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 18, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span>© 2026 Microgreen Uzbekistan</span>
          <span style={{ display: 'flex', gap: 20 }}>
            <a href="#" style={{ color: SUB, textDecoration: 'none' }}>Доставка</a>
            <a href="#" style={{ color: SUB, textDecoration: 'none' }}>Конфиденциальность</a>
            <a href="#" style={{ color: SUB, textDecoration: 'none' }}>Контакты</a>
          </span>
        </div>
      </footer>
    </div>
  ),
};
