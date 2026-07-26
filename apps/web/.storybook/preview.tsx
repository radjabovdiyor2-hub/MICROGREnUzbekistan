import React, { useEffect } from 'react';
import type { Preview, Decorator } from '@storybook/nextjs-vite';

// The whole design system (tokens → components → templates) comes from globals.css.
import '../src/app/globals.css';

/** Drives the design-system theme via [data-theme], exactly like the app's
 *  ThemeProvider — so every story is verifiable in both light and dark. */
const withTheme: Decorator = (Story, context) => {
  const theme = (context.globals.theme as string) || 'light';
  useEffect(() => {
    // Fixed/portal content (modals, toasts) reads the token vars off <html>.
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  return (
    <div
      data-theme={theme}
      style={{
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-body)',
        padding: '32px',
        minHeight: '100vh',
      }}
    >
      <Story />
    </div>
  );
};

const preview: Preview = {
  decorators: [withTheme],
  initialGlobals: { theme: 'light' },
  globalTypes: {
    theme: {
      description: 'Design-system theme',
      toolbar: {
        title: 'Theme',
        icon: 'contrast',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    layout: 'centered',
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    viewport: {
      viewports: {
        mobile: { name: 'Mobile (375)', styles: { width: '375px', height: '812px' } },
        mobileLg: { name: 'Mobile LG (480)', styles: { width: '480px', height: '896px' } },
        tablet: { name: 'Tablet (768)', styles: { width: '768px', height: '1024px' } },
        desktop: { name: 'Desktop (1024)', styles: { width: '1024px', height: '768px' } },
        wide: { name: 'Wide (1280)', styles: { width: '1280px', height: '800px' } },
      },
    },
  },
};

export default preview;
