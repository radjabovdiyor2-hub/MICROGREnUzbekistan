'use client';

import React from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Tooltip } from './Tooltip';
import { Button } from './Button';
import { HelpCircle, Info } from 'lucide-react';

const meta = {
  title: 'Primitives/Tooltip',
  component: Tooltip,
  parameters: { layout: 'centered' },
  args: { content: 'Подсказка', children: null },
  argTypes: {
    position: { control: 'inline-radio', options: ['top', 'bottom'] },
    content: { control: 'text' },
  },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Interactive — tweak position and content via Controls. */
export const Playground: Story = {
  args: {
    content: 'Подсказка',
    position: 'top',
    children: <Button variant="outline">Наведите</Button>,
  },
};

/** Top vs bottom positions. */
export const Positions: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 40, padding: 60 }}>
      <Tooltip content="Позиция: сверху" position="top">
        <Button variant="outline" size="sm">Top</Button>
      </Tooltip>
      <Tooltip content="Позиция: снизу" position="bottom">
        <Button variant="outline" size="sm">Bottom</Button>
      </Tooltip>
    </div>
  ),
};

/** With icon trigger — common pattern for help/info. */
export const IconTrigger: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 32, alignItems: 'center', padding: 40 }}>
      <Tooltip content="Справка по разделу">
        <span style={{ cursor: 'help', color: 'var(--text-muted)', display: 'inline-flex' }}>
          <HelpCircle size={20} />
        </span>
      </Tooltip>
      <Tooltip content="Дополнительная информация" position="bottom">
        <span style={{ cursor: 'help', color: 'var(--info)', display: 'inline-flex' }}>
          <Info size={20} />
        </span>
      </Tooltip>
    </div>
  ),
};

/** Long content — verifies text doesn't wrap awkwardly. */
export const LongContent: Story = {
  render: () => (
    <div style={{ padding: 80 }}>
      <Tooltip content="Это длинная подсказка, которая проверяет поведение при большом объёме текста в тултипе">
        <Button variant="ghost" size="sm">Длинный текст</Button>
      </Tooltip>
    </div>
  ),
};

/** Keyboard accessible — focus via Tab to trigger tooltip. */
export const KeyboardAccessible: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 20, padding: 60 }}>
      <Tooltip content="Фокус через Tab">
        <Button variant="primary" size="sm">Tab сюда</Button>
      </Tooltip>
      <Tooltip content="Второй элемент" position="bottom">
        <Button variant="accent" size="sm">И сюда</Button>
      </Tooltip>
    </div>
  ),
};
