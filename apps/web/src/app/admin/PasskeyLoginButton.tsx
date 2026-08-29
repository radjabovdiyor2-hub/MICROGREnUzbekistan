'use client';

import { useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';

// ══════════════════════════════════════════════════════════════════════
// Вход по Face ID / Touch ID.
//
// КНОПКИ НЕТ, ПОКА НЕТ КЛЮЧА. Прежняя кнопка висела всегда и всегда
// отвечала ошибкой — сервер отдавал 501. Кнопка, которая гарантированно не
// работает, хуже её отсутствия: человек жмёт её первой и каждый раз узнаёт,
// что она не работает. Поэтому сначала спрашиваем сервер, привязан ли хоть
// один ключ, и рисуем себя только тогда.
//
// ПОСЛЕ УСПЕХА — ПЕРЕЗАГРУЗКА, а не установка состояния в браузере. Роль
// приходит из подписанной куки, которую читает сервер (`admin/page.tsx`);
// перезагрузка — самый короткий путь показать ровно то, что решил сервер,
// и не завести второй источник правды о том, кто вошёл.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  lang: 'ru' | 'uz';
  onError: (message: string) => void;
}

const text = {
  button: { ru: 'Войти по Face ID / Touch ID', uz: 'Face ID / Touch ID bilan kirish' },
  working: { ru: 'Ждём подтверждения…', uz: 'Tasdiqlash kutilmoqda…' },
  cancelled: { ru: 'Вход отменён', uz: 'Kirish bekor qilindi' },
  failed: { ru: 'Ключ не подошёл — войдите паролем', uz: 'Kalit mos kelmadi — parol bilan kiring' },
};

export function PasskeyLoginButton({ lang, onError }: Props) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    // Отказ запроса — это «кнопку не показываем», а не ошибка на экране
    // входа: пароль работает и без неё.
    fetch('/api/auth/webauthn', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((d) => alive && setAvailable(Boolean(d?.available)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!available) return null;

  const run = async () => {
    setBusy(true);
    try {
      const optRes = await fetch('/api/auth/webauthn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'login-options' }),
      });
      const opt = await optRes.json();
      if (!optRes.ok) throw new Error(opt?.error || text.failed[lang]);

      const credential = await startAuthentication({ optionsJSON: opt.publicKey });

      const verifyRes = await fetch('/api/auth/webauthn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'login-verify', sessionId: opt.sessionId, credential }),
      });
      const verified = await verifyRes.json();
      if (!verifyRes.ok || !verified?.success) {
        throw new Error(verified?.error || text.failed[lang]);
      }

      window.location.reload();
    } catch (error) {
      // Отмену пальцем ошибкой не называем: человек передумал, а не сломал.
      const name = error instanceof Error ? error.name : '';
      onError(name === 'NotAllowedError' ? text.cancelled[lang] : String((error as Error)?.message || text.failed[lang]));
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="btn btn-outline btn-lg btn-block"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        justifyContent: 'center',
        marginBottom: 'var(--space-3)',
      }}
    >
      <Fingerprint size={18} /> {busy ? text.working[lang] : text.button[lang]}
    </button>
  );
}
