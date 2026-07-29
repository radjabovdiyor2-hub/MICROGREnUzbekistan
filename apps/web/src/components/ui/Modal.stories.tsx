import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Modal } from './Modal';
import { Button } from './Button';

const meta = {
  title: 'Primitives/Modal',
  component: Modal,
  parameters: { layout: 'centered' },
  // Required props — the Default story overrides everything via `render`, but
  // Storybook's types need the required args satisfied at the meta level.
  args: { open: false, onClose: () => {}, children: null },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Click to open. Backdrop click / Esc closes it. Fully token-driven and
 *  theme-aware — toggle the Theme toolbar with the modal open. */
export const Default: Story = {
  render: function Render() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Открыть модалку</Button>
        <Modal open={open} onClose={() => setOpen(false)}>
          <div style={{ padding: 'var(--space-6)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', marginBottom: 'var(--space-3)' }}>
              Подтвердите действие
            </h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)' }}>
              Это модальное окно построено на токенах дизайн-системы и адаптируется к светлой и тёмной теме.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setOpen(false)}>Отмена</Button>
              <Button onClick={() => setOpen(false)}>Подтвердить</Button>
            </div>
          </div>
        </Modal>
      </>
    );
  },
};
