import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Progress } from './Progress';

const meta = {
  title: 'Primitives/Progress',
  component: Progress,
  parameters: { layout: 'centered' },
  args: { value: 60, label: 'Загрузка' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** The full 0 → 100 range. */
export const Steps: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[0, 25, 50, 75, 100].map((v) => (
        <Progress key={v} value={v} label={`${v}%`} />
      ))}
    </div>
  ),
};
