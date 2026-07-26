import React from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from '../ui/Button';
import { ArrowRight, Sparkles } from 'lucide-react';

const meta: Meta = {
  title: 'Templates/Hero',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

/** Standard hero — headline + subtitle + CTA + ambient background.
 *  Mirrors HeroSection composition from the homepage. */
export const Default: Story = {
  render: () => (
    <section className="hero-tpl">
      <div className="hero-tpl__bg" />
      <div className="hero-tpl__content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          <Sparkles size={16} style={{ color: 'var(--brand-accent)' }} />
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--brand-primary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
            Свежая микрозелень
          </span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(var(--text-2xl), 5vw, var(--text-4xl))', fontWeight: 800, lineHeight: 1.1, marginBottom: 'var(--space-4)', color: 'var(--text-primary)' }}>
          Вырастим для вас<br />за 7–10 дней
        </h1>
        <p style={{ fontSize: 'var(--text-lg)', color: 'var(--text-secondary)', maxWidth: 520, lineHeight: 1.6, marginBottom: 'var(--space-6)' }}>
          Живая микрозелень с доставкой по Ташкенту. Без ГМО, без химии — только солнце и вода.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Button variant="primary" size="lg" rightIcon={<ArrowRight size={18} />}>
            Каталог
          </Button>
          <Button variant="outline" size="lg">
            Подробнее
          </Button>
        </div>
      </div>
    </section>
  ),
};

/** Compact hero — for secondary pages (catalog header, etc). */
export const Compact: Story = {
  render: () => (
    <section className="hero-tpl hero-tpl--compact">
      <div className="hero-tpl__bg" />
      <div className="hero-tpl__content">
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)', color: 'var(--text-primary)' }}>
          Каталог
        </h1>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)' }}>
          Микрозелень, бейби-лиф и готовые салаты
        </p>
      </div>
    </section>
  ),
};
