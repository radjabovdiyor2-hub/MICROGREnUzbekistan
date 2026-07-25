import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Input } from './Input';

const meta = {
  title: 'Primitives/Input',
  component: Input,
  parameters: { layout: 'centered' },
  args: { label: 'Email', placeholder: 'you@example.com' },
  argTypes: {
    inputSize: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    disabled: { control: 'boolean' },
  },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Default · focus · error · disabled. */
export const States: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Input label="Обычное" placeholder="Введите текст" hint="Подсказка под полем" />
      <Input label="С автофокусом" placeholder="Кликните сюда" autoFocus />
      <Input label="С ошибкой" defaultValue="неверно@" error="Некорректный email" />
      <Input label="Отключено" placeholder="Недоступно" disabled />
    </div>
  ),
};

/** Size scale. */
export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Input inputSize="sm" label="Small" placeholder="sm" />
      <Input inputSize="md" label="Medium" placeholder="md" />
      <Input inputSize="lg" label="Large" placeholder="lg" />
    </div>
  ),
};
