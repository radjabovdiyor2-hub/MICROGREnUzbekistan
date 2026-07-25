import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Badge } from './Badge';

const meta = {
  title: 'Primitives/Badge',
  component: Badge,
  parameters: { layout: 'centered' },
  args: { children: 'Badge', variant: 'primary' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'accent', 'ghost', 'outline', 'success', 'warning', 'error', 'info'],
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Brand variants. */
export const Brand: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Badge variant="primary">Primary</Badge>
      <Badge variant="accent">Accent</Badge>
      <Badge variant="ghost">Ghost</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
};

/** Semantic variants (status). */
export const Semantic: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Badge variant="success">В наличии</Badge>
      <Badge variant="warning">Заканчивается</Badge>
      <Badge variant="error">Нет в наличии</Badge>
      <Badge variant="info">Новинка</Badge>
    </div>
  ),
};
