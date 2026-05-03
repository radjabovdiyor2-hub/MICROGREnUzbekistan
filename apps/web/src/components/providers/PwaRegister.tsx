'use client';

import { useEffect } from 'react';

export function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          console.log('✅ SW registered:', reg.scope);

          // Check for updates every 60 seconds
          setInterval(() => {
            reg.update().catch(() => {});
          }, 60_000);

          // When a new SW is found and installed
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                // New version activated — reload for fresh content
                console.log('🔄 New version detected — reloading...');
                window.location.reload();
              }
            });
          });
        })
        .catch((err) => {
          console.error('❌ SW registration failed:', err);
        });

      // Listen for messages from SW (e.g. SW_UPDATED)
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SW_UPDATED') {
          console.log('🔄 SW updated to:', event.data.version);
          window.location.reload();
        }
      });
    }
  }, []);

  return null;
}
