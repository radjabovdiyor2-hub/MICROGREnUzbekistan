import type { Meta, StoryObj } from '@storybook/nextjs-vite';

// Live, theme-aware catalog of the design tokens. Toggle the Theme toolbar to see
// every value flip. Source of truth: design-system/tokens/tokens.json.
const meta: Meta = {
  title: 'Foundations/Tokens',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

const Swatch = ({ name }: { name: string }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 118 }}>
    <div style={{ height: 56, borderRadius: 'var(--radius-md)', background: `var(--${name})`, border: '1px solid var(--border)' }} />
    <code style={{ fontSize: 11, color: 'var(--text-secondary)' }}>--{name}</code>
  </div>
);

const Group = ({ title, names }: { title: string; names: string[] }) => (
  <section style={{ marginBottom: 28 }}>
    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', marginBottom: 12 }}>{title}</h3>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      {names.map((n) => <Swatch key={n} name={n} />)}
    </div>
  </section>
);

export const Colors: Story = {
  render: () => (
    <div style={{ maxWidth: 'var(--max-width)' }}>
      <Group title="Brand" names={['brand-primary', 'brand-primary-hover', 'brand-primary-light', 'brand-accent', 'brand-accent-hover', 'brand-accent-light']} />
      <Group title="Semantic" names={['success', 'warning', 'error', 'info']} />
      <Group title="Surfaces" names={['bg-primary', 'bg-secondary', 'bg-tertiary', 'bg-card', 'bg-elevated']} />
      <Group title="Text & border" names={['text-primary', 'text-secondary', 'text-muted', 'text-link', 'border', 'border-strong']} />
      <Group title="Categorical (charts / status)" names={['cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6', 'cat-7', 'cat-8']} />
    </div>
  ),
};

export const Typography: Story = {
  render: () => (
    <div style={{ maxWidth: 720 }}>
      {(['4xl', '3xl', '2xl', 'xl', 'lg', 'base', 'sm', 'xs'] as const).map((s) => (
        <div key={s} style={{ fontSize: `var(--text-${s})`, fontFamily: 'var(--font-display)', marginBottom: 8, lineHeight: 1.2 }}>
          text-{s} — Живое меню 1234
        </div>
      ))}
      <hr style={{ margin: '20px 0', border: 0, borderTop: '1px solid var(--border)' }} />
      <p style={{ fontFamily: 'var(--font-body)', marginBottom: 6 }}>font-body — The quick brown fox / Свежая микрозелень</p>
      <p style={{ fontFamily: 'var(--font-display)' }}>font-display — The quick brown fox / Свежая микрозелень</p>
    </div>
  ),
};

export const RadiusAndShadow: Story = {
  render: () => (
    <div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', marginBottom: 12 }}>Radius</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 28 }}>
        {(['sm', 'md', 'lg', 'xl', '2xl'] as const).map((r) => (
          <div key={r} style={{ width: 84, height: 84, background: 'var(--brand-primary-light)', color: 'var(--brand-primary)', borderRadius: `var(--radius-${r})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>{r}</div>
        ))}
      </div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', marginBottom: 12 }}>Shadow</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        {(['sm', 'md', 'lg', 'xl', 'card'] as const).map((s) => (
          <div key={s} style={{ width: 84, height: 84, background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', boxShadow: `var(--shadow-${s})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>{s}</div>
        ))}
      </div>
    </div>
  ),
};
