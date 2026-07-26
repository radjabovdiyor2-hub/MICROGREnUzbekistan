import type { StorybookConfig } from '@storybook/nextjs-vite';

const config: StorybookConfig = {
  // Tier-2 primitives + tier-3 composed templates live under src/components;
  // design-system may hold catalog stories too.
  stories: [
    '../src/components/**/*.stories.@(ts|tsx)',
    '../design-system/**/*.stories.@(ts|tsx)',
  ],
  // Core (controls, actions, viewport, toolbars, backgrounds) ships in Storybook
  // itself — no extra addons needed for the state catalog.
  addons: ['@storybook/addon-viewport'],
  framework: {
    name: '@storybook/nextjs-vite',
    options: {},
  },
  staticDirs: ['../public'],
};

export default config;
