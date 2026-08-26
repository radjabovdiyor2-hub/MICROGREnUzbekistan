'use client';

import { useState } from 'react';
import { Building2, Check, Loader2 } from 'lucide-react';

import { useLang } from '@/components/providers/LangProvider';

// ══════════════════════════════════════════════════════════════════════
// Заявка ресторана на поставку.
//
// `POST /api/leads` был написан, защищён лимитом и заводил в офисе клиента
// со `status='lead'`, событие `B2B_LEAD_CREATED` и уведомление владельцу —
// и не вызывался НИОТКУДА: формы на сайте не существовало. Весь контур
// HoReCa (ночной сбор лидов из 2ГИС, утренние КП, воронка) работал только с
// теми, кого нашли сами; ресторан, пришедший на сайт, оставить заявку не мог.
//
// Поля намеренно необязательные по отдельности: API требует лишь один
// контакт из трёх. Шеф-повар пишет с телефона между сменами, и форма из
// шести обязательных полей — это отказ от заявки, а не её качество.
// ══════════════════════════════════════════════════════════════════════

const field: React.CSSProperties = {
  width: '100%',
  padding: 'var(--space-3)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: 'var(--text-base)',
};

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-secondary)',
  marginBottom: 6,
};

export function LeadForm() {
  const { t } = useLang();
  const [form, setForm] = useState({ companyName: '', contactName: '', phone: '', message: '' });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    if (!form.phone.trim() && !form.contactName.trim() && !form.companyName.trim()) {
      setError(t("Kamida telefon raqamini qoldiring", 'Оставьте хотя бы номер телефона'));
      return;
    }
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.status === 429) {
        setError(t("Juda ko'p urinish. Birozdan so'ng qayta yuboring", 'Слишком много попыток. Попробуйте позже'));
        return;
      }
      if (!res.ok) throw new Error('failed');
      setDone(true);
    } catch {
      setError(t("Yuborilmadi. Telefon orqali bog'laning", 'Не отправилось. Позвоните нам, пожалуйста'));
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
        <Check size={40} style={{ color: 'var(--success)', marginBottom: 'var(--space-3)' }} />
        <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 6 }}>
          {t('Arizangiz qabul qilindi', 'Заявка принята')}
        </h3>
        <p style={{ color: 'var(--text-secondary)' }}>
          {t(
            "Menejer ish kuni davomida bog'lanadi va narxlar ro'yxatini yuboradi.",
            'Менеджер свяжется в течение рабочего дня и пришлёт прайс.',
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 'var(--space-6)' }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-4)' }}>
        <Building2 size={20} /> {t('Hamkorlik uchun ariza', 'Заявка на сотрудничество')}
      </h3>

      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <div>
          <label style={label} htmlFor="lead-company">{t('Muassasa nomi', 'Название заведения')}</label>
          <input id="lead-company" style={field} value={form.companyName}
            placeholder={t('Masalan: Osh Markazi', 'Например: Плов Центр')}
            onChange={(e) => set({ companyName: e.target.value })} />
        </div>
        <div>
          <label style={label} htmlFor="lead-name">{t('Ismingiz', 'Ваше имя')}</label>
          <input id="lead-name" style={field} value={form.contactName}
            onChange={(e) => set({ contactName: e.target.value })} />
        </div>
        <div>
          <label style={label} htmlFor="lead-phone">{t('Telefon', 'Телефон')}</label>
          <input id="lead-phone" style={field} type="tel" inputMode="tel" value={form.phone}
            placeholder="+998 __ ___ __ __"
            onChange={(e) => set({ phone: e.target.value })} />
        </div>
        <div>
          <label style={label} htmlFor="lead-message">{t("Nima kerak?", 'Что нужно?')}</label>
          <textarea id="lead-message" style={{ ...field, minHeight: 96, resize: 'vertical' }}
            value={form.message}
            placeholder={t(
              "Masalan: haftasiga 20 lotok mikroko'kat, dushanba va payshanba",
              'Например: 20 лотков микрозелени в неделю, понедельник и четверг',
            )}
            onChange={(e) => set({ message: e.target.value })} />
        </div>

        {error && (
          <div style={{ color: 'var(--error)', fontSize: 'var(--text-sm)' }}>{error}</div>
        )}

        <button className="btn btn-primary" disabled={sending} onClick={submit}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {sending && <Loader2 size={16} className="spin" />}
          {t('Ariza yuborish', 'Отправить заявку')}
        </button>

        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'center' }}>
          {t(
            "Faqat bog'lanish uchun ishlatamiz. Reklama yubormaymiz.",
            'Используем только для связи. Рассылок не шлём.',
          )}
        </p>
      </div>
    </div>
  );
}
