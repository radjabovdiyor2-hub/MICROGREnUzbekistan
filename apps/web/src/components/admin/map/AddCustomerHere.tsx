'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';

import { useFeedback } from '../AdminFeedback';
import { COMPANY_TYPES } from '@/lib/customers/companyTypes';
import { readPosition } from '@/lib/geo/position';

// ══════════════════════════════════════════════════════════════════════
// Завести клиента, стоя у его дверей.
//
// ЗАЧЕМ. Продавец идёт по улице и видит заведение, которого в базе нет. До
// сих пор он мог только запомнить его и завести вечером — по памяти, без
// адреса и без координаты. Половина увиденных дверей так и не заводилась.
//
// ПИН БЕРЁТСЯ ИЗ ПОЗИЦИИ ТЕЛЕФОНА, А НЕ ИЗ ЦЕНТРА ЭКРАНА. Человек стоит у
// входа — это самая честная координата, какая вообще бывает: точнее
// геокодера по адресу и точнее пальца по карте. Если GPS не ответил,
// заводим без координаты и честно говорим об этом: пин потом поставят
// кнопкой «переставить», а терять само заведение из-за молчащего датчика
// незачем.
//
// ДУБЛЬ НЕ ЗАПРЕЩАЕМ. Сервер отвечает 409 и показывает, что рядом уже есть;
// решает человек, который там стоит. В торговом центре двери соседних
// заведений в тридцати метрах друг от друга — запрет ломал бы работу чаще,
// чем спасал от дубля.
// ══════════════════════════════════════════════════════════════════════

const TITLE = { ru: 'Новое заведение', uz: 'Yangi obyekt' };

export function AddCustomerHere({ lang }: { lang: 'ru' | 'uz' }) {
  const notify = useFeedback();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyType, setCompanyType] = useState('');

  const save = async (force: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const at = await readPosition();
      const res = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          name,
          phone: phone || null,
          companyType: companyType || null,
          latitude: at?.latitude,
          longitude: at?.longitude,
          accuracyM: at?.accuracyM,
          force,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; duplicate?: { name: string; distanceM: number } }
        | null;

      if (res.status === 409 && body?.duplicate) {
        // Спрашиваем, а не отказываем: рядом действительно может стоять
        // другое заведение, и знает об этом только тот, кто там стоит.
        const agreed = await notify.confirm({
          title: body.error ?? 'Рядом уже есть клиент',
          detail: 'Это другое заведение? Тогда заведём отдельной карточкой.',
          confirmText: 'Всё равно завести',
        });
        setBusy(false);
        if (agreed) await save(true);
        return;
      }

      if (!res.ok) throw new Error(body?.error || 'Не удалось завести клиента');

      notify.success(
        at ? 'Заведение добавлено на карту' : 'Заведение добавлено — пин поставьте позже',
      );
      queryClient.invalidateQueries({ queryKey: ['admin-customers-map'] });
      setOpen(false);
      setName('');
      setPhone('');
      setCompanyType('');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Не удалось завести клиента');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => setOpen(true)}
        style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <UserPlus size={16} /> {lang === 'ru' ? 'Заведение' : 'Obyekt'}
      </button>
    );
  }

  return (
    <div className="card" style={{ padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)', minWidth: 240 }}>
      <strong style={{ fontSize: 'var(--text-sm)' }}>{TITLE[lang]}</strong>

      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={lang === 'ru' ? 'Название' : 'Nomi'}
        autoFocus
        style={{ minHeight: 44 }}
      />
      <select
        className="input"
        value={companyType}
        onChange={(e) => setCompanyType(e.target.value)}
        style={{ minHeight: 44 }}
      >
        <option value="">{lang === 'ru' ? 'Тип заведения' : 'Obyekt turi'}</option>
        {Object.entries(COMPANY_TYPES).map(([slug, meta]) => (
          <option key={slug} value={slug}>
            {meta[lang]}
          </option>
        ))}
      </select>
      <input
        className="input"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder={lang === 'ru' ? 'Телефон (не обязательно)' : 'Telefon (majburiy emas)'}
        inputMode="tel"
        style={{ minHeight: 44 }}
      />

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || name.trim().length < 2}
          onClick={() => void save(false)}
          style={{ minHeight: 44, flex: 1 }}
        >
          {busy ? '…' : lang === 'ru' ? 'Завести здесь' : 'Shu yerda'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen(false)}
          style={{ minHeight: 44 }}
        >
          {lang === 'ru' ? 'Отмена' : 'Bekor'}
        </button>
      </div>
    </div>
  );
}
