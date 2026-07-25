import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChevronRight } from 'lucide-react';

// Tier-3 Apple-style marketing landing (Figma "Landing page", node 1:902) adapted
// to the Apple aesthetic on our design system. Distinct from Templates/Apple Style
// (product-focused): this one is brand-story + social proof — how it works, customer
// quotes, stats, CTA. Frosted nav, oversized headlines, off-white bands, pills,
// generous whitespace. Brand green accent. Original design (no Apple assets).
const meta: Meta = {
  title: 'Templates/Apple Landing',
  parameters: { layout: 'fullscreen', backgrounds: { disable: true } },
};
export default meta;
type Story = StoryObj;

const SF = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif";
const INK = '#1d1d1f';
const SUB = '#86868b';
const OFFWHITE = '#fbfbfd';
const PANEL = '#f5f5f7';

const STEPS = [
  { n: '01', t: 'Выбираете', d: '12 сортов микрозелени и готовые наборы.' },
  { n: '02', t: 'Мы срезаем', d: 'Утром в день доставки — не раньше.' },
  { n: '03', t: 'Готовите', d: 'Салаты, боулы, смузи — живые витамины.' },
];
const QUOTES = [
  { q: '«Руккола как с грядки — беру каждую неделю».', a: 'Азиза', r: 'Ташкент' },
  { q: '«Наборы для проращивания — дети в восторге».', a: 'Дмитрий', r: 'Самарканд' },
  { q: '«Свежесть, которой нет в супермаркете».', a: 'Малика', r: 'Ташкент' },
];

const Pill = ({ children }: { children: React.ReactNode }) => (
  <a href="#" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 22px', borderRadius: 980, fontSize: 17, fontWeight: 500, background: 'var(--brand-primary)', color: '#fff', textDecoration: 'none' }}>{children}</a>
);

export const Default: Story = {
  render: () => (
    <div style={{ fontFamily: SF, color: INK, background: '#fff', WebkitFontSmoothing: 'antialiased' }}>
      {/* Frosted nav */}
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(255,255,255,0.72)', backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 22px', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em' }}>Microgreen</span>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            {['Магазин', 'Как это работает', 'Отзывы'].map((l) => (
              <a key={l} href="#" className="hidden md:inline" style={{ color: INK, opacity: 0.85, fontSize: 12, textDecoration: 'none' }}>{l}</a>
            ))}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '80px 22px 0' }}>
        <p style={{ color: 'var(--brand-primary)', fontSize: 21, fontWeight: 600, marginBottom: 8 }}>Микрозелень из Узбекистана</p>
        <h1 style={{ fontSize: 'clamp(40px, 8vw, 84px)', fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1.02, margin: 0 }}>
          Свежесть<br />по подписке.
        </h1>
        <p style={{ fontSize: 'clamp(19px, 2.4vw, 28px)', color: SUB, margin: '18px auto 28px', maxWidth: 620 }}>
          Живая зелень к вашему столу — каждую неделю, без забот.
        </p>
        <div style={{ display: 'flex', gap: 24, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
          <Pill>Оформить подписку</Pill>
          <a href="#" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--brand-primary)', fontSize: 17, textDecoration: 'none' }}>Как это работает <ChevronRight size={16} /></a>
        </div>
        <div style={{ maxWidth: 980, margin: '48px auto 0', aspectRatio: '16 / 9', borderRadius: 28, background: 'linear-gradient(160deg, var(--brand-primary-light), #eef2f5 70%)', boxShadow: '0 30px 60px -30px rgba(0,0,0,0.25)' }} />
      </section>

      {/* How it works */}
      <section style={{ maxWidth: 980, margin: '0 auto', padding: 'clamp(72px, 10vw, 130px) 22px' }}>
        <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 600, letterSpacing: '-0.03em', textAlign: 'center', margin: '0 0 48px' }}>Как это работает</h2>
        <div style={{ display: 'grid', gap: 28, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {STEPS.map((s) => (
            <div key={s.n} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--brand-primary)', marginBottom: 12 }}>{s.n}</div>
              <h3 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 6 }}>{s.t}</h3>
              <p style={{ color: SUB, fontSize: 18 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ background: OFFWHITE, padding: 'clamp(72px, 10vw, 130px) 22px' }}>
        <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 600, letterSpacing: '-0.03em', textAlign: 'center', margin: '0 0 48px' }}>Нас любят</h2>
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: 22, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {QUOTES.map((c) => (
            <div key={c.a} style={{ background: '#fff', borderRadius: 24, padding: 32, boxShadow: '0 4px 24px rgba(0,0,0,0.05)' }}>
              <p style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.35, marginBottom: 20 }}>{c.q}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--brand-primary-light)' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{c.a}</div>
                  <div style={{ color: SUB, fontSize: 14 }}>{c.r}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section style={{ maxWidth: 980, margin: '0 auto', padding: 'clamp(64px, 9vw, 110px) 22px', display: 'grid', gap: 40, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', textAlign: 'center' }}>
        {[['12', 'сортов'], ['3 000+', 'заказов'], ['24 ч', 'от грядки до стола']].map(([n, l]) => (
          <div key={l}>
            <div style={{ fontSize: 'clamp(40px, 6vw, 68px)', fontWeight: 600, letterSpacing: '-0.03em', color: 'var(--brand-primary)' }}>{n}</div>
            <div style={{ color: SUB, fontSize: 19, marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section style={{ background: OFFWHITE, textAlign: 'center', padding: 'clamp(72px, 10vw, 120px) 22px' }}>
        <h2 style={{ fontSize: 'clamp(30px, 4.5vw, 48px)', fontWeight: 600, letterSpacing: '-0.03em', marginBottom: 24 }}>Начните со свежего.</h2>
        <Pill>Оформить подписку</Pill>
      </section>

      {/* Footer */}
      <footer style={{ background: PANEL, color: SUB, fontSize: 12, padding: '40px 22px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 18, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span>© 2026 Microgreen Uzbekistan</span>
          <span style={{ display: 'flex', gap: 20 }}>
            <a href="#" style={{ color: SUB, textDecoration: 'none' }}>Магазин</a>
            <a href="#" style={{ color: SUB, textDecoration: 'none' }}>Доставка</a>
            <a href="#" style={{ color: SUB, textDecoration: 'none' }}>Контакты</a>
          </span>
        </div>
      </footer>
    </div>
  ),
};
