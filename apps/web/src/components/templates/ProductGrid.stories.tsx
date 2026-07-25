import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ShoppingCart } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import type { BadgeVariant } from '../ui/Badge';

// Tier-3 template: how the primitives compose into a real catalog grid. This is
// the composition the Phase-5 reference screen (ProductCard) formalises.
const meta: Meta = {
  title: 'Templates/Product Grid',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

const items: { name: string; cat: string; price: string; badge: string | null; tone: BadgeVariant }[] = [
  { name: 'Руккола', cat: 'Микрозелень', price: '32 000', badge: 'Хит', tone: 'accent' },
  { name: 'Горох', cat: 'Микрозелень', price: '28 000', badge: 'Новинка', tone: 'info' },
  { name: 'Редис', cat: 'Микрозелень', price: '30 000', badge: null, tone: 'info' },
  { name: 'Подсолнечник', cat: 'Микрозелень', price: '35 000', badge: '−15%', tone: 'error' },
  { name: 'Базилик', cat: 'Микрозелень', price: '40 000', badge: null, tone: 'info' },
  { name: 'Набор для проращивания', cat: 'Наборы', price: '149 000', badge: 'Хит', tone: 'accent' },
];

export const Default: Story = {
  render: () => (
    <div style={{ padding: 'var(--space-6)', maxWidth: 'var(--max-width)', margin: '0 auto' }}>
      <h2 className="section-title" style={{ marginBottom: 'var(--space-6)' }}>Каталог</h2>
      <div className="product-grid">
        {items.map((it) => (
          <Card key={it.name} padded={false}>
            <div
              style={{
                position: 'relative',
                aspectRatio: '1',
                background: 'linear-gradient(135deg, var(--brand-primary-light), var(--bg-tertiary))',
              }}
            >
              {it.badge && (
                <span style={{ position: 'absolute', top: 8, left: 8 }}>
                  <Badge variant={it.tone}>{it.badge}</Badge>
                </span>
              )}
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {it.cat}
              </span>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)' }}>{it.name}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', color: 'var(--brand-primary)', fontSize: 'var(--text-lg)', whiteSpace: 'nowrap' }}>
                {it.price} сум
              </span>
              <Button size="sm" block leftIcon={<ShoppingCart size={14} />} style={{ marginTop: 'var(--space-2)' }}>
                В корзину
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  ),
};
