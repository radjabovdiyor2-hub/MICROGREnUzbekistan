'use client';

import { useState } from 'react';
import type { AuthMode } from './AdminAuthScreens';

// ══════════════════════════════════════════════════════════════════════
// Вход в админку: владелец по паролю, продавец по PIN.
// Вынесено из AdminShell — файл перерос 200 строк.
//
// Роль приходит с сервера из cookie (initialRole): sessionStorage здесь
// не годится — вкладка помнила бы вход после отзыва доступа.
// ══════════════════════════════════════════════════════════════════════

/** Кто вошёл: владелец или сотрудник по PIN. */
export type StaffRole = 'ADMIN' | 'SELLER';

export function useAdminAuth(
  initialRole: StaffRole | null,
  initialName: string,
  t: (ru: string, uz: string) => string,
) {
  const [authMode, setAuthMode] = useState<AuthMode>('choose');
  const [isOwner, setIsOwner] = useState(initialRole === 'ADMIN');
  const [sellerName, setSellerName] = useState(
    initialRole === 'SELLER' ? initialName : '',
  );
  // Роль вошедшего: владелец видит всю админку, сотрудник по PIN — кассу,
  // клиентов и свой рейс (`SELLER_TABS`).
  const [staffRole, setStaffRole] = useState<StaffRole | null>(initialRole);
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [authError, setAuthError] = useState('');

  const handleOwnerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      // POST, а не GET: в query-строке пароль оседал в логах nginx,
      // в истории браузера и в Referer. Сервер в ответ ставит
      // httpOnly-cookie — пароль на клиенте больше не хранится.
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'login', password }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setIsOwner(true);
        setAuthError('');
        setPassword('');
      } else if (res.status === 429) {
        setAuthError(
          t(
            `Слишком много попыток. Повторите через ${data.retryAfter ?? 900} с`,
            `Juda ko'p urinish. ${data.retryAfter ?? 900} soniyadan keyin urining`,
          ),
        );
      } else {
        setAuthError(data.error || "Parol noto'g'ri");
      }
    } catch {
      setAuthError("Server bilan bog'lanib bo'lmadi");
    }
  };

  const handleSellerLogin = async (pinValue?: string) => {
    const p = pinValue ?? pin;
    if (p.length !== 4) return;
    try {
      const res = await fetch('/api/inventory/employees/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: p }),
      });
      const data = await res.json();
      if (data.success) {
        setSellerName(data.employee.name);
        setStaffRole('SELLER');
        setAuthError('');
      } else {
        setAuthError(t("Неверный PIN", "PIN noto'g'ri"));
        setPin('');
      }
    } catch {
      setAuthError(t('Ошибка', 'Xatolik yuz berdi'));
    }
  };

  const handlePinPress = (digit: number) => {
    if (pin.length >= 4) return;
    const nextPin = pin + String(digit);
    setPin(nextPin);
    if (nextPin.length === 4) {
      handleSellerLogin(nextPin);
    }
  };

  const handleLogout = async () => {
    // Гасим серверную сессию, а не только флаг в браузере: иначе cookie
    // осталась бы валидной и после «выхода».
    const endpoint = isOwner ? '/api/auth/password' : '/api/inventory/employees/auth';
    try {
      await fetch(endpoint, { method: 'DELETE', credentials: 'same-origin' });
    } catch {
      // сеть недоступна — локальное состояние всё равно сбрасываем
    }
    setIsOwner(false);
    setSellerName('');
    setStaffRole(null);
    setAuthMode('choose');
    setPassword('');
    setPin('');
  };

  return {
    authMode, setAuthMode, isOwner, sellerName, staffRole, password, setPassword,
    pin, setPin, authError, setAuthError,
    handleOwnerLogin, handleSellerLogin, handlePinPress, handleLogout,
    isAuthenticated: isOwner || sellerName,
  };
}
