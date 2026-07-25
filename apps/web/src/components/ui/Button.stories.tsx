import React from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ShoppingCart, ArrowRight, Heart } from 'lucide-react';
import { Button } from './Button';

const meta = {
  title: 'Primitives/Button',
  component: Button,
  parameters: { layout: 'centered' },
  args: { children: 'Кнопка', variant: 'primary', size: 'md' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['primary', 'accent', 'outline', 'ghost'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg', 'icon'] },
    block: { control: 'boolean' },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>
);
const Stack = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>{children}</div>
);

/** Interactive — tweak variant/size/state via the Controls panel. */
export const Playground: Story = {};

/** All four variants. */
export const Variants: Story = {
  render: () => (
    <Row>
      <Button variant="primary">Primary</Button>
      <Button variant="accent">Accent</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
    </Row>
  ),
};

/** Size scale — sm · md · lg · icon (44px tap target). */
export const Sizes: Story = {
  render: () => (
    <Row>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" aria-label="Favourite"><Heart size={18} /></Button>
    </Row>
  ),
};

/** Every state: default, disabled, loading (per variant). */
export const States: Story = {
  render: () => (
    <Stack>
      {(['primary', 'accent', 'outline', 'ghost'] as const).map((v) => (
        <Row key={v}>
          <span style={{ width: 72, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{v}</span>
          <Button variant={v}>Default</Button>
          <Button variant={v} disabled>Disabled</Button>
          <Button variant={v} loading>Loading</Button>
        </Row>
      ))}
    </Stack>
  ),
};

/** Icons before/after the label, and a full-width block button. */
export const WithIcons: Story = {
  render: () => (
    <Stack>
      <Row>
        <Button leftIcon={<ShoppingCart size={16} />}>В корзину</Button>
        <Button variant="outline" rightIcon={<ArrowRight size={16} />}>Дальше</Button>
      </Row>
      <div style={{ width: 320 }}>
        <Button block leftIcon={<ShoppingCart size={16} />}>Оформить заказ</Button>
      </div>
    </Stack>
  ),
};
