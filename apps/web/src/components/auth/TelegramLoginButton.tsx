'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth, TelegramUser } from '@/components/providers/AuthProvider';
import { MessageCircle } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import { motion } from 'framer-motion';

interface TelegramLoginProps {
  botName?: string;
  buttonSize?: 'large' | 'medium' | 'small';
  cornerRadius?: number;
  requestAccess?: boolean;
}

export function TelegramLoginButton({
  botName = 'Microgreenuzbekistan_bot',
  buttonSize = 'large',
  cornerRadius = 14,
  requestAccess = true,
}: TelegramLoginProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { login } = useAuth();
  const { t } = useLang();
  const [widgetLoaded, setWidgetLoaded] = useState(false);
  const [widgetFailed, setWidgetFailed] = useState(false);

  // Check if widget actually rendered an iframe
  const checkWidgetRendered = useCallback(() => {
    if (!containerRef.current) return;
    const iframe = containerRef.current.querySelector('iframe');
    if (iframe) {
      setWidgetLoaded(true);
    } else {
      setWidgetFailed(true);
    }
  }, []);

  useEffect(() => {
    // Define the global callback
    (window as unknown as Record<string, unknown>).onTelegramAuth = async (user: TelegramUser) => {
      await login(user);
    };

    // Create the Telegram script
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botName);
    script.setAttribute('data-size', buttonSize);
    script.setAttribute('data-radius', String(cornerRadius));
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    if (requestAccess) {
      script.setAttribute('data-request-access', 'write');
    }
    script.async = true;

    // Append to container
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(script);
    }

    // Check if widget rendered after timeout
    const timer = setTimeout(checkWidgetRendered, 3000);

    return () => {
      clearTimeout(timer);
      delete (window as unknown as Record<string, unknown>).onTelegramAuth;
    };
  }, [botName, buttonSize, cornerRadius, requestAccess, login, checkWidgetRendered]);

  // Fallback: redirect to Telegram bot directly for login
  const handleFallbackLogin = () => {
    // Open bot with start command that includes origin for redirect
    const origin = window.location.origin;
    window.open(
      `https://t.me/${botName}?start=login_${encodeURIComponent(origin)}`,
      '_blank'
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '100%' }}>
      {/* Telegram Widget Container */}
      <div ref={containerRef} id="telegram-login-widget" style={{ minHeight: 40 }} />

      {/* Fallback button — always show as alternative */}
      <motion.button
        onClick={handleFallbackLogin}
        className="ripple"
        whileHover={{ scale: 1.02, boxShadow: '0 6px 20px rgba(0, 136, 204, 0.4)' }}
        whileTap={{ scale: 0.98 }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          maxWidth: '320px',
          padding: '12px 24px',
          background: 'linear-gradient(135deg, #0088cc, #0099e6)',
          color: 'white',
          border: 'none',
          borderRadius: `${cornerRadius}px`,
          fontSize: '15px',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(0, 136, 204, 0.3)',
        }}
        id="telegram-login-fallback"
      >
        <MessageCircle size={20} />
        {t("Telegram orqali kirish", "Войти через Telegram")}
      </motion.button>

      {widgetFailed && (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.4 }}>
          {t(
            "Telegram widget yuklanmadi. Yuqoridagi tugmani bosing — bot orqali kirasiz.",
            "Виджет Telegram не загрузился. Нажмите кнопку выше — войдёте через бот."
          )}
        </p>
      )}
    </div>
  );
}
