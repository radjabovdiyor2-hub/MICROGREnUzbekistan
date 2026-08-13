import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ShoppingBag, Search, ChevronRight } from 'lucide-react';

// Tier-3 reference — an Apple-inspired product page on our design system.
// Aesthetic: system font stack (SF on Apple devices), oversized tight-tracked
// headlines, off-white bands, pill buttons, big radii, subtle shadows, generous
// whitespace. Brand green is the single accent. NOT a copy of Apple assets —
// original design for the microgreen brand. This is the "Apple direction" proof
// to review before rethemeing tokens + scaling to all components/pages.
const meta: Meta = {
  title: 'Templates/Apple Style',
  parameters: { layout: 'fullscreen', backgrounds: { disable: true } },
};
export default meta;
type Story = StoryObj;

const SF = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif";
const INK = '#1d1d1f';
const SUB = '#86868b';
const OFFWHITE = '#fbfbfd';
const PANEL = '#f5f5f7';

const Pill = ({ children, tone = 'accent', href = '#' }: { children: React.ReactNode; tone?: 'accent' | 'ghost'; href?: string }) => (
  <a
    href={href}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '12px 22px', borderRadius: 980, fontSize: 17, fontWeight: 500, lineHeight: 1,
      textDecoration: 'none', transition: 'all .2s ease',
      ...(tone === 'accent'
        ? { background: 'var(--brand-primary)', color: '#fff' }
        : { background: 'transparent', color: 'var(--brand-primary)' }),
    }}
  >
    {children}
  </a>
);

const TextLink = ({ children }: { children: React.ReactNode }) => (
  <a href="#" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--brand-primary)', fontSize: 17, textDecoration: 'none' }}>
    {children} <ChevronRight size={16} />
  </a>
);

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
      <section style={{ textAlign: 'center', padding: '64px 22px 0' }}>
        <p style={{ color: 'var(--brand-primary)', fontSize: 21, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 8 }}>Руккола</p>
        <h1 style={{ fontSize: 'clamp(40px, 7vw, 80px)', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.05, margin: 0 }}>
          Живая польза.<br />Каждый день.
        </h1>
        <p style={{ fontSize: 'clamp(19px, 2.4vw, 28px)', color: SUB, letterSpacing: '-0.01em', margin: '18px 0 26px' }}>
          Срезаем утром — доставляем к обеду.
        </p>
        <div style={{ display: 'flex', gap: 24, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
          <Pill>Купить · 32 000 сум</Pill>
          <TextLink>Узнать больше</TextLink>
        </div>
        <div style={{ maxWidth: 980, margin: '48px auto 0', aspectRatio: '16 / 10', borderRadius: 28, background: 'linear-gradient(160deg, var(--brand-primary-light), #eef2f5 70%)', boxShadow: '0 30px 60px -30px rgba(0,0,0,0.25)' }} />
      </section>

      {/* Statement band */}
      <section style={{ background: OFFWHITE, textAlign: 'center', padding: 'clamp(80px, 12vw, 140px) 22px' }}>
        <h2 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.08, maxWidth: 900, margin: '0 auto' }}>
          Срезано утром. На тарелке в тот же день.
        </h2>
        <p style={{ fontSize: 'clamp(17px, 2vw, 21px)', color: SUB, marginTop: 18 }}>Витамины K, C и фолиевая кислота — в каждом ростке.</p>
      </section>

      {/* Feature tiles */}
      <section style={{ maxWidth: 980, margin: '0 auto', padding: '22px', display: 'grid', gap: 22, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {[
          { t: 'Без химии', d: 'Только семена, вода и свет. Ноль удобрений и пестицидов.' },
          { t: '12 сортов', d: 'Руккола, горох, редис, подсолнечник, базилик и не только.' },
        ].map((f) => (
          <div key={f.t} style={{ background: PANEL, borderRadius: 28, padding: 40, minHeight: 420, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <h3 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 8 }}>{f.t}</h3>
            <p style={{ color: SUB, fontSize: 19, marginBottom: 16 }}>{f.d}</p>
            <TextLink>Подробнее</TextLink>
          </div>
        ))}
      </section>

      {/* Stats */}
      <section style={{ maxWidth: 980, margin: '0 auto', padding: 'clamp(64px, 9vw, 110px) 22px', display: 'grid', gap: 40, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', textAlign: 'center' }}>
        {[['7 дней', 'от семени до среза'], ['0', 'химии и ГМО'], ['24 ч', 'от грядки до стола']].map(([n, l]) => (
          <div key={l}>
            <div style={{ fontSize: 'clamp(44px, 6vw, 72px)', fontWeight: 600, letterSpacing: '-0.03em', color: 'var(--brand-primary)' }}>{n}</div>
            <div style={{ color: SUB, fontSize: 19, marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </section>

      {/* CTA band */}
      <section style={{ background: OFFWHITE, textAlign: 'center', padding: 'clamp(72px, 10vw, 120px) 22px' }}>
        <h2 style={{ fontSize: 'clamp(30px, 4.5vw, 48px)', fontWeight: 600, letterSpacing: '-0.03em', marginBottom: 24 }}>Готовы попробовать?</h2>
        <div style={{ display: 'flex', gap: 24, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
          <Pill>Оформить набор</Pill>
          <TextLink>Как это работает</TextLink>
        </div>
      </section>

      {/* Minimal footer */}
      <footer style={{ background: '#f5f5f7', color: SUB, fontSize: 12, padding: '32px 22px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 18, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span>© 2026 Microgreen Uzbekistan</span>
          <span style={{ display: 'flex', gap: 20 }}>
            <a href="#" style={{ color: SUB, textDecoration: 'none' }}>Конфиденциальность</a>
            <a href="#" style={{ color: SUB, textDecoration: 'none' }}>Доставка</a>
            <a href="#" style={{ color: SUB, textDecoration: 'none' }}>Контакты</a>
          </span>
        </div>
      </footer>
    </div>
  ),
};
