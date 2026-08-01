'use client';

import { useState, useEffect } from 'react';
import { Download, Leaf, X } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const { t } = useLang();

  useEffect(() => {
    // Check if already installed or dismissed recently
    const hasDismissed = localStorage.getItem('pwa_prompt_dismissed');
    if (hasDismissed) {
      const dismissedTime = parseInt(hasDismissed);
      // If dismissed less than 3 days ago, don't show
      if (Date.now() - dismissedTime < 3 * 24 * 60 * 60 * 1000) {
        return;
      }
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Add a slight delay before showing the prompt for better UX
      setTimeout(() => setShowPrompt(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa_prompt_dismissed', Date.now().toString());
  };

  if (!showPrompt) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(var(--bottom-nav-height) + var(--space-4))',
      left: 'var(--space-4)',
      right: 'var(--space-4)',
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-xl)',
      padding: 'var(--space-4)',
      boxShadow: '0 10px 40px rgba(var(--overlay-dark-rgb), 0.15)',
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)',
      zIndex: 9999,
      animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          boxShadow: '0 4px 12px rgba(var(--brand-primary-rgb), 0.3)'
        }}>
          <Leaf color="white" size={24} />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', marginBottom: 2 }}>
            Microgreen Agro
          </h3>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            {t(
              "Ilovani o'rnating va xaridlarni tezroq amalga oshiring. Offlayn rejim qo'llab-quvvatlanadi!",
              "Установите приложение для быстрого доступа. Поддерживается офлайн режим!"
            )}
          </p>
        </div>
        <button onClick={handleDismiss} style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          cursor: 'pointer', padding: 4, display: 'flex'
        }}>
          <X size={18} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button onClick={handleInstall} className="btn btn-primary" style={{ flex: 1, padding: '10px 0', fontSize: 'var(--text-sm)', display: 'flex', justifyContent: 'center', gap: 6 }}>
          <Download size={16} /> {t("O'rnatish", "Установить")}
        </button>
      </div>
    </div>
  );
}
