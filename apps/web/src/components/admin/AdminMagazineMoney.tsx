'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Megaphone, Printer } from 'lucide-react';
import { useState } from 'react';

import { AdminMagazinePrintLeads } from './AdminMagazinePrintLeads';
import { AdminMagazinePrintRun } from './AdminMagazinePrintRun';
import { AdminNotice } from './AdminNotice';
import { AdminSearch, matchesQuery } from './AdminSearch';
import { useFeedback } from './AdminFeedback';

// ══════════════════════════════════════════════════════════════════════
// Деньги журнала: подписки на тираж, счета за печать, рекламодатели.
//
// ЧЕГО НЕ БЫЛО. Три группы API существовали и не имели ни одного экрана.
// То есть тираж считался кроном, счета выставлялись кроном, а увидеть,
// кто сколько должен и сколько это принесло, было негде — при том что
// печать это прямые расходы, а реклама и подписка — прямая выручка.
//
// ТРИ РАЗДЕЛА НА ОДНОМ ЭКРАНЕ, а не три вкладки: это один вопрос —
// «сколько журнал зарабатывает и сколько стоит», и разводить его по
// вкладкам значит заставлять складывать в уме.
// ══════════════════════════════════════════════════════════════════════

interface Subscription {
  id: string;
  plan: string;
  copiesPerIssue: number;
  pricePerCopy: number;
  unitCost: number;
  status: string;
  restaurant?: { name: string | null } | null;
}

interface PrintOrder {
  id: string;
  copies: number;
  revenue: number;
  cost: number;
  margin: number;
  status: string;
  createdAt: string;
  issue?: { number: number; titleRu: string; restaurant?: { name: string | null } | null } | null;
  subscription?: { restaurant?: { name: string | null } | null } | null;
}

interface Advertiser {
  id: string;
  companyName: string;
  contactPerson: string | null;
  phone: string | null;
  status: string;
  format: string | null;
  amount: number | null;
}

const money = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

/** Кому выставлен счёт: заведение номера, иначе — заведение подписки. */
function billedTo(order: PrintOrder): string | null {
  return order.issue?.restaurant?.name || order.subscription?.restaurant?.name || null;
}

const SUB_STATUS: Record<string, string> = {
  active: 'активна', paused: 'пауза', cancelled: 'отменена',
};
const ORDER_STATUS: Record<string, string> = {
  pending: 'ждёт печати', printing: 'в печати', delivered: 'доставлен',
  paid: 'оплачен', cancelled: 'отменён',
};
const AD_STATUS: Record<string, string> = {
  lead: 'интерес', active: 'контракт', past: 'прошлое',
};
const AD_FORMAT: Record<string, string> = {
  cover_ar: 'обложка с AR', spread: 'разворот', page: 'полоса',
};

/** Список из ответа. Не массив — считаем пустым: экран важнее ответа. */
async function fetchList<T>(url: string): Promise<T[]> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Не удалось загрузить');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export function AdminMagazineMoney({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const queryClient = useQueryClient();
  const notify = useFeedback();
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  // Три запроса объявлены по отдельности, а не через общий помощник:
  // хук нельзя звать из обычной функции — порядок вызовов на каждом
  // рендере обязан совпадать, и правило это стережёт не зря.
  const subs = useQuery<Subscription[]>({
    queryKey: ['mag-subs'],
    queryFn: () => fetchList('/api/admin/magazine/subscriptions'),
  });
  const orders = useQuery<PrintOrder[]>({
    queryKey: ['mag-print-orders'],
    queryFn: () => fetchList('/api/admin/magazine/print-orders'),
  });
  const ads = useQuery<Advertiser[]>({
    queryKey: ['mag-advertisers'],
    queryFn: () => fetchList('/api/admin/magazine/advertisers'),
  });

  const patch = async (url: string, body: Record<string, unknown>, key: string) => {
    setError('');
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Не получилось');
      notify.success(t('Сохранено', 'Saqlandi'));
      queryClient.invalidateQueries({ queryKey: [key] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось');
    }
  };

  const subRows = (subs.data ?? []).filter((s) =>
    matchesQuery(query, s.restaurant?.name, s.plan, s.status));
  const orderRows = (orders.data ?? []).filter((o) =>
    matchesQuery(query, billedTo(o), o.issue?.titleRu, o.status));
  const adRows = (ads.data ?? []).filter((a) =>
    matchesQuery(query, a.companyName, a.contactPerson, a.phone, a.status));

  // Итог по неоплаченным счетам — то число, ради которого экран и нужен.
  const unpaid = orderRows
    .filter((o) => o.status !== 'paid' && o.status !== 'cancelled')
    .reduce((n, o) => n + o.revenue, 0);
  const contracted = adRows
    .filter((a) => a.status === 'active')
    .reduce((n, a) => n + (a.amount ?? 0), 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Banknote size={24} /> {t('Тираж и реклама', 'Tiraj va reklama')}
        </h2>
        <AdminSearch value={query} onChange={setQuery}
          placeholder={t('Поиск по заведению и телефону', 'Muassasa yoki telefon')} width={220} />
      </div>

      <AdminNotice>{error}</AdminNotice>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            {t('Не оплачено за тираж', "Tiraj uchun to'lanmagan")}
          </div>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--warning)' }}>
            {money(unpaid)} so&apos;m
          </div>
        </div>
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            {t('Контракты на рекламу', 'Reklama shartnomalari')}
          </div>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--brand-primary)' }}>
            {money(contracted)} so&apos;m
          </div>
        </div>
      </div>

      {/* ── Подписки на тираж ─────────────────────────────────────── */}
      <Section icon={<Printer size={16} />} title={t('Подписки на тираж', 'Tiraj obunalari')} count={subRows.length}>
        {subRows.map((s) => (
          <Row key={s.id}
            title={s.restaurant?.name || t('без ресторана', 'restoransiz')}
            detail={`${s.copiesPerIssue} ${t('копий', 'nusxa')} · ${money(s.pricePerCopy)} / ${money(s.unitCost)} ${t('себест.', 'tannarx')}`}
            badge={SUB_STATUS[s.status] ?? s.status}
            actions={s.status === 'active' ? [
              { label: t('Пауза', 'Pauza'), run: () => patch('/api/admin/magazine/subscriptions', { id: s.id, status: 'paused' }, 'mag-subs') },
            ] : [
              { label: t('Возобновить', 'Davom ettirish'), run: () => patch('/api/admin/magazine/subscriptions', { id: s.id, status: 'active' }, 'mag-subs') },
            ]}
          />
        ))}
      </Section>

      {/* ── Счета за печать ───────────────────────────────────────── */}
      <Section icon={<Banknote size={16} />} title={t('Счета за печать', "Bosma hisoblari")} count={orderRows.length}>
        <AdminMagazinePrintRun lang={lang} />
        {orderRows.map((o) => (
          <Row key={o.id}
            title={billedTo(o) || t('без ресторана', 'restoransiz')}
            detail={`${o.issue ? `№${o.issue.number} · ` : ''}${o.copies} ${t('копий', 'nusxa')} · ${money(o.revenue)} − ${money(o.cost)} = ${money(o.margin)}`}
            badge={ORDER_STATUS[o.status] ?? o.status}
            actions={o.status !== 'paid' && o.status !== 'cancelled' ? [
              { label: t('Оплачен', "To'landi"), run: () => patch('/api/admin/magazine/print-orders', { id: o.id, status: 'paid' }, 'mag-print-orders') },
            ] : []}
          />
        ))}
      </Section>

      {/* ── Заявки на печатный номер ──────────────────────────────── */}
      <AdminMagazinePrintLeads query={query} lang={lang} />

      {/* ── Рекламодатели ─────────────────────────────────────────── */}
      <Section icon={<Megaphone size={16} />} title={t('Рекламодатели', 'Reklama beruvchilar')} count={adRows.length}>
        {adRows.map((a) => (
          <Row key={a.id}
            title={a.companyName}
            detail={[
              a.contactPerson, a.phone,
              a.format ? AD_FORMAT[a.format] ?? a.format : null,
              a.amount ? `${money(a.amount)} so'm` : null,
            ].filter(Boolean).join(' · ')}
            badge={AD_STATUS[a.status] ?? a.status}
            actions={a.status === 'lead' ? [
              { label: t('Контракт', 'Shartnoma'), run: () => patch('/api/admin/magazine/advertisers', { id: a.id, status: 'active' }, 'mag-advertisers') },
            ] : []}
          />
        ))}
      </Section>
    </div>
  );
}

function Section({ icon, title, count, children }: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 'var(--space-5)' }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>
        {icon} {title}
        <span style={{ color: 'var(--text-muted)', fontWeight: 'var(--font-normal)' }}>({count})</span>
      </h3>
      {count === 0
        ? <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>—</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>}
    </div>
  );
}

function Row({ title, detail, badge, actions }: {
  title: string;
  detail: string;
  badge: string;
  actions: { label: string; run: () => void }[];
}) {
  return (
    <div className="card" style={{ padding: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontWeight: 'var(--font-semibold)' }}>{title}</div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{detail}</div>
      </div>
      <span style={{
        padding: '3px 8px', borderRadius: 4, fontSize: 12,
        background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
      }}>{badge}</span>
      {actions.map((a) => (
        <button key={a.label} className="btn btn-sm" onClick={a.run}>{a.label}</button>
      ))}
    </div>
  );
}
