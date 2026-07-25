import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Toast } from './Toast';

const meta = {
  title: 'Primitives/Toast',
  component: Toast,
  parameters: { layout: 'centered' },
  args: { variant: 'info', inline: true, children: 'Уведомление' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['success', 'error', 'warning', 'info'] },
  },
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** All four variants, with and without a close button. */
export const Variants: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 340 }}>
      <Toast inline variant="success">Заказ успешно оформлен</Toast>
      <Toast inline variant="error" onClose={() => {}}>Не удалось сохранить изменения</Toast>
      <Toast inline variant="warning">Товар заканчивается на складе</Toast>
      <Toast inline variant="info" onClose={() => {}}>Пришло новое сообщение</Toast>
    </div>
  ),
};
