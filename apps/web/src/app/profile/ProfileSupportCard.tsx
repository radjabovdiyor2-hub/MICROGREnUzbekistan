'use client';

import { useState } from 'react';
import { Check, Download, LifeBuoy, Loader2, Trash2 } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Обращение в поддержку и права на свои данные.
//
// Оба API были написаны и не вызывались ниоткуда:
//
//   • `POST /api/support` заводит в офисе срочную задачу и пишет владельцу в
//     Telegram — а пожаловаться с сайта было негде вовсе. Человек оставался
//     с проблемой один на один, и компания о ней не узнавала;
//
//   • `POST /api/users/data` — право забрать и удалить свои данные (Закон РУз
//     «О персональных данных», ст. 20). Роут ссылается на закон, проверяет
//     подписанный Telegram initData и не имел ни одной кнопки. Право,
//     которым нельзя воспользоваться, правом не является.
//
// Права на данные требуют подписи Telegram, поэтому показываются только
// внутри Mini App: снаружи кнопка вела бы к отказу 401 без объяснения.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  t: (uz: string, ru: string) => string;
}

const field: React.CSSProperties = {
  width: '100%',
  padding: 'var(--space-3)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: 'var(--text-base)',
};

/** initData Mini App — им подписывается право на свои данные. */
function initData(): string | null {
  if (typeof window === 'undefined') return null;
  const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
  return tg?.WebApp?.initData || null;
}

export function ProfileSupportCard({ t }: Props) {
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const [dataBusy, setDataBusy] = useState('');

  const send = async () => {
    if (message.trim().length < 3) {
      setError(t('Muammoni yozing', 'Опишите проблему'));
      return;
    }
    setState('sending');
    setError('');
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, message }),
      });
      if (res.status === 429) {
        setError(t("Juda ko'p murojaat. Birozdan so'ng", 'Слишком часто. Попробуйте позже'));
        setState('idle');
        return;
      }
      if (!res.ok) throw new Error('failed');
      setState('sent');
      setMessage('');
    } catch {
      setError(t("Yuborilmadi. Telefon qiling", 'Не отправилось. Позвоните нам'));
      setState('idle');
    }
  };

  /** Выгрузка и удаление — один роут, разное действие. */
  const personalData = async (action: 'export' | 'delete') => {
    const signed = initData();
    if (!signed) return;

    if (action === 'delete') {
      const ok = window.confirm(
        t(
          "Ma'lumotlaringiz o'chiriladi va buyurtmalar tarixi bog'lanmagan bo'ladi. Davom etamizmi?",
          'Данные будут обезличены, история заказов отвяжется от вас. Продолжить?',
        ),
      );
      if (!ok) return;
    }

    setDataBusy(action);
    setError('');
    try {
      const res = await fetch('/api/users/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: signed, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'failed');

      if (action === 'export') {
        // Отдаём файл, а не показываем JSON на экране: выгрузка нужна,
        // чтобы её унести, а не чтобы на неё посмотреть.
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'microgreen-my-data.json';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        setError(t("Ma'lumotlar o'chirildi", 'Данные удалены'));
      }
    } catch {
      setError(t('Bajarilmadi', 'Не получилось'));
    } finally {
      setDataBusy('');
    }
  };

  const inTelegram = Boolean(initData());

  return (
    <div className="card" style={{ overflow: 'hidden', marginTop: 'var(--space-4)' }}>
      <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <LifeBuoy size={18} /> {t('Yordam', 'Поддержка')}
        </h3>
      </div>

      <div style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
        {state === 'sent' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--success)' }}>
            <Check size={18} />
            {t('Murojaat qabul qilindi — menejer bog\'lanadi', 'Обращение принято — менеджер свяжется')}
          </div>
        ) : (
          <>
            <textarea style={{ ...field, minHeight: 88, resize: 'vertical' }}
              value={message}
              placeholder={t('Nima bo\'ldi?', 'Что случилось?')}
              onChange={(e) => setMessage(e.target.value)} />
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <input style={{ ...field, flex: '1 1 140px' }} value={name}
                placeholder={t('Ismingiz', 'Ваше имя')}
                onChange={(e) => setName(e.target.value)} />
              <input style={{ ...field, flex: '1 1 140px' }} type="tel" value={phone}
                placeholder={t('Telefon', 'Телефон')}
                onChange={(e) => setPhone(e.target.value)} />
            </div>
            <button className="btn btn-primary" disabled={state === 'sending'} onClick={send}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {state === 'sending' && <Loader2 size={16} className="spin" />}
              {t('Yuborish', 'Отправить')}
            </button>
          </>
        )}

        {error && <div style={{ color: 'var(--error)', fontSize: 'var(--text-sm)' }}>{error}</div>}

        {inTelegram && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
              {t('Mening maʼlumotlarim', 'Мои данные')}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <button className="btn btn-sm" disabled={Boolean(dataBusy)}
                onClick={() => personalData('export')}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Download size={14} /> {t('Yuklab olish', 'Скачать')}
              </button>
              <button className="btn btn-sm" disabled={Boolean(dataBusy)}
                onClick={() => personalData('delete')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--error)', color: 'var(--error)' }}>
                <Trash2 size={14} /> {t('O\'chirish', 'Удалить')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
