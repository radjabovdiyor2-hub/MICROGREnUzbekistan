import type { Meta, StoryObj } from '@storybook/nextjs-vite';

// Tier-3 template: a section header + animated sprout divider (templates.css).
const meta: Meta = {
  title: 'Templates/Section',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

export const WithDivider: Story = {
  render: () => (
    <div style={{ maxWidth: 'var(--max-width)', margin: '0 auto', padding: 'var(--space-8) var(--space-4)' }}>
      <h2 className="section-title">Почему микрозелень</h2>
      <p className="section-subtitle">В 4–40 раз больше витаминов, чем во взрослых растениях.</p>

      <div className="sprout-divider">
        <div className="sprout-divider__line" />
        <svg className="sprout-divider__svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            className="sprout-divider__stem"
            d="M12 22V11"
            stroke="var(--brand-primary)"
            strokeWidth="2"
            strokeLinecap="round"
            style={{ transformOrigin: 'bottom' }}
          />
          <path d="M12 13C12 9 9 7 6 7c0 4 3 6 6 6z" fill="var(--brand-primary)" opacity="0.7" />
          <path d="M12 11c0-3 3-5 6-5 0 3-3 5-6 5z" fill="var(--brand-primary)" />
        </svg>
        <div className="sprout-divider__line" />
      </div>
    </div>
  ),
};
