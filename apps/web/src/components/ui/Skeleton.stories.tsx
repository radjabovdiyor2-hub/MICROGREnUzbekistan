import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Skeleton } from './Skeleton';

const meta = {
  title: 'Primitives/Skeleton',
  component: Skeleton,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Text (multi-line), rectangle, circle. */
export const Shapes: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: 320 }}>
      <Skeleton shape="text" lines={3} />
      <Skeleton shape="rect" width="100%" height={120} />
      <Skeleton shape="circle" width={48} height={48} />
    </div>
  ),
};

/** A product-card loading placeholder composed from skeletons. */
export const CardPlaceholder: Story = {
  render: () => (
    <div style={{ width: 220, border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
      <Skeleton shape="rect" width="100%" height={160} />
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Skeleton shape="text" width="80%" />
        <Skeleton shape="text" width="50%" />
        <Skeleton shape="rect" width="100%" height={32} />
      </div>
    </div>
  ),
};
