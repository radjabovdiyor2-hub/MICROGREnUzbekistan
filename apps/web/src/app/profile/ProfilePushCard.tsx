'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Уведомления о заказе в браузер.
//
// ЗАЧЕМ. У покупателя БЕЗ Telegram канала не было вовсе: статус уходил
// только личным сообщением бота, и человек, оформивший заказ на сайте,
// узнавал о доставке, когда курьер звонил в дверь.
//
// КАРТОЧКА ПОЯВЛЯЕТСЯ, ТОЛЬКО ЕСЛИ ВОЗМОЖНОСТЬ РЕАЛЬНО ЕСТЬ: заданы ключи
// на сервере, браузер умеет push и есть регистрация service worker.
// Показать кнопку, которая заведомо не сработает, хуже, чем не показать
// ничего, — человек нажмёт и решит, что сломано.
//
// РАЗРЕШЕНИЕ СПРАШИВАЕМ ПО НАЖАТИЮ, а не при открытии страницы. Запрос без
// повода браузеры показывают одинаково — и его одинаково отклоняют, после
// чего спросить второй раз нельзя уже никогда.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  t: (uz: string, ru: string) => string;
}

/**
 * base64url ключа VAPID → байты, как того требует `subscribe`.
 *
 * Буфер создаётся явно: типы DOM ждут `ArrayBuffer`, а `new Uint8Array(n)`
 * описан шире (`ArrayBufferLike`) и не подходит по типу, хотя в рантайме
 * это одно и то же.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function ProfilePushCard({ t }: Props) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;

    const supported =
      typeof window !== 'undefined'
      && 'serviceWorker' in navigator
      && 'PushManager' in window;
    if (!supported) return;

    (async () => {
      try {
        const res = await fetch('/api/push');
        const data = await res.json();
        if (!alive || !data?.enabled) return;
        setPublicKey(data.publicKey);

        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (alive) setSubscribed(Boolean(existing));
      } catch {
        // Возможности нет — карточки тоже.
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (!publicKey) return null;

  const subscribe = async () => {
    setBusy(true);
    setError('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError(t(
          'Bildirishnomalar brauzerda taqiqlangan',
          'Уведомления запрещены в браузере — разрешите их в настройках сайта',
        ));
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const res = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (res.status === 401) {
        setError(t('Avval tizimga kiring', 'Сначала войдите — уведомления привязаны к аккаунту'));
        await sub.unsubscribe();
        return;
      }
      if (!res.ok) throw new Error('failed');
      setSubscribed(true);
    } catch {
      setError(t('Yoqilmadi', 'Не получилось включить'));
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    setBusy(true);
    setError('');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE' });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      setError(t('Oʻchirilmadi', 'Не получилось выключить'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ overflow: 'hidden', marginTop: 'var(--space-4)' }}>
      <div style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {subscribed ? <Bell size={18} /> : <BellOff size={18} />}
            {t('Buyurtma haqida bildirishnoma', 'Уведомления о заказе')}
          </div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 4 }}>
            {subscribed
              ? t('Yoqilgan — status oʻzgarsa xabar beramiz', 'Включены — сообщим, когда статус изменится')
              : t('Telegramsiz ham xabardor boʻling', 'Чтобы узнавать статус без Telegram')}
          </div>
        </div>

        <button className={subscribed ? 'btn btn-sm' : 'btn btn-primary btn-sm'}
          disabled={busy} onClick={subscribed ? unsubscribe : subscribe}>
          {subscribed ? t('Oʻchirish', 'Выключить') : t('Yoqish', 'Включить')}
        </button>
      </div>

      {error && (
        <div style={{ padding: '0 var(--space-4) var(--space-4)', color: 'var(--error)', fontSize: 'var(--text-sm)' }}>
          {error}
        </div>
      )}
    </div>
  );
}
