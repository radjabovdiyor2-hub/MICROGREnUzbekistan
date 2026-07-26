'use client';

import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Drawer } from './Drawer';
import { Button } from './Button';

const meta = {
  title: 'Primitives/Drawer',
  component: Drawer,
  parameters: { layout: 'fullscreen' },
  args: { open: false, onClose: () => {}, children: null },
  argTypes: {
    height: { control: 'text' },
  },
} satisfies Meta<typeof Drawer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Interactive — open/close via button, swipe down to dismiss. */
export const Playground: Story = {
  args: { open: false, height: 'auto' },
  render: function Render(args) {
    const [open, setOpen] = useState(args.open);
    return (
      <div style={{ padding: 'var(--space-8)' }}>
        <Button onClick={() => setOpen(true)}>Открыть Drawer</Button>
        <Drawer {...args} open={open} onClose={() => setOpen(false)}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', marginBottom: 'var(--space-4)' }}>
            Заголовок
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>
            Потяните вниз или нажмите на фон, чтобы закрыть.
            Drawer использует spring-анимацию и блокирует скролл body.
          </p>
          <div style={{ marginTop: 'var(--space-6)', display: 'flex', gap: 'var(--space-3)' }}>
            <Button variant="primary" onClick={() => setOpen(false)}>Подтвердить</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          </div>
        </Drawer>
      </div>
    );
  },
};

/** Fixed height — 60% of viewport. */
export const FixedHeight: Story = {
  render: function Render() {
    const [open, setOpen] = useState(false);
    return (
      <div style={{ padding: 'var(--space-8)' }}>
        <Button onClick={() => setOpen(true)}>Drawer 60vh</Button>
        <Drawer open={open} onClose={() => setOpen(false)} height="60vh">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', marginBottom: 'var(--space-4)' }}>
            Фиксированная высота
          </h3>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            {Array.from({ length: 20 }, (_, i) => (
              <p key={i} style={{ marginBottom: 'var(--space-2)' }}>
                Строка контента #{i + 1} — внутренний скролл работает.
              </p>
            ))}
          </div>
        </Drawer>
      </div>
    );
  },
};

/** Rich content — form inside drawer. */
export const WithForm: Story = {
  render: function Render() {
    const [open, setOpen] = useState(false);
    return (
      <div style={{ padding: 'var(--space-8)' }}>
        <Button onClick={() => setOpen(true)}>Форма в Drawer</Button>
        <Drawer open={open} onClose={() => setOpen(false)}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', marginBottom: 'var(--space-4)' }}>
            Быстрый заказ
          </h3>
          <div className="field" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="field__label">Имя</label>
            <input className="field__input" placeholder="Введите имя" />
          </div>
          <div className="field" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="field__label">Телефон</label>
            <input className="field__input" placeholder="+998 ..." />
          </div>
          <Button block variant="primary" onClick={() => setOpen(false)}>
            Отправить
          </Button>
        </Drawer>
      </div>
    );
  },
};
