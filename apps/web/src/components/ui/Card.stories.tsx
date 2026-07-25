import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Card } from './Card';
import { Button } from './Button';
import { Badge } from './Badge';

const meta = {
  title: 'Primitives/Card',
  component: Card,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <div style={{ width: 320 }}>
      <Card>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', marginBottom: 'var(--space-2)' }}>
          Заголовок карточки
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
          Небольшое описание содержимого карточки на пару строк.
        </p>
        <Button size="sm">Действие</Button>
      </Card>
    </div>
  ),
};

export const WithBadge: Story = {
  render: () => (
    <div style={{ width: 320 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}>Микрозелень</h3>
          <Badge variant="success">В наличии</Badge>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          Свежая партия рукколы, срезка сегодня утром.
        </p>
      </Card>
    </div>
  ),
};

/** Edge-to-edge media with padded content below (padded=false at the top). */
export const EdgeToEdge: Story = {
  render: () => (
    <div style={{ width: 260 }}>
      <Card padded={false}>
        <div style={{ height: 150, background: 'linear-gradient(135deg, var(--brand-primary-light), var(--bg-tertiary))' }} />
        <div className="card-body">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', marginBottom: 'var(--space-1)' }}>
            Набор для проращивания
          </h3>
          <span style={{ color: 'var(--brand-primary)', fontWeight: 'var(--font-bold)' }}>149 000 сум</span>
        </div>
      </Card>
    </div>
  ),
};
