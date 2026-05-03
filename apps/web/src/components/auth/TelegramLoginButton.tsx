'use client';

import { useEffect, useRef } from 'react';
import { useAuth, TelegramUser } from '@/components/providers/AuthProvider';

interface TelegramLoginProps {
  botName: string;
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

    return () => {
      delete (window as unknown as Record<string, unknown>).onTelegramAuth;
    };
  }, [botName, buttonSize, cornerRadius, requestAccess, login]);

  return <div ref={containerRef} id="telegram-login-widget" />;
}
