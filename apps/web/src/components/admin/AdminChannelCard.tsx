'use client';

import { useState } from 'react';

import { sumLabel } from '@/lib/units';
import { AlertTriangle, Check, ExternalLink, Link2 } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Карточка одного канала продаж: состояние и настройки владельца.
//
// Всё, что здесь правится, — это рубильники безопасности скоропорта.
// Буфер держит последние лотки для своих заказов, отсечка снимает свежее
// после ухода машины, город — единственное место, куда канал довозит за
// сутки. Пустой список городов означает «свежее не выставляем вовсе», и
// это осознанный ответ, а не незаполненное поле.
// ══════════════════════════════════════════════════════════════════════

export interface ChannelView {
  code: string;
  name: string;
  nameUz: string;
  kind: string;
  syncMode: string;
  allowsPerishable: boolean;
  acceptsOrders: boolean;
  isActive: boolean;
  cities: string[];
  markupPercent: number;
  stockBuffer: number;
  orderCutoff: string | null;
  apiUrl: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  listings: number;
  queued: number;
  orders30d: number;
  revenue30d: number;
}

const money = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

/** Адрес выгрузки для каналов, которые забирают её сами. */
const FEED_URL: Record<string, string> = {
  google_shopping: '/feed/google.xml',
  ai_agents: '/feed/agents.json',
  meta_catalog: '/feed/meta.csv',
};

const T = {
  perishable: { ru: ' · без скоропорта', uz: " · tez buziladigan mahsulotsiz" },
  on: { ru: 'включён', uz: 'yoqilgan' },
  off: { ru: 'выключен', uz: "o'chirilgan" },
  cards: { ru: 'карточек', uz: 'kartalar' },
  orders30: { ru: 'заказов за 30 дней', uz: '30 kunlik buyurtmalar' },
  revenue: { ru: 'выручка', uz: 'tushum' },
  queued: { ru: 'в очереди', uz: 'navbatda' },
  synced: { ru: 'синхронизация', uz: 'sinxronlash' },
  cities: { ru: 'Города (через запятую)', uz: 'Shaharlar (vergul bilan)' },
  markup: { ru: 'Наценка, %', uz: "Ustama, %" },
  buffer: { ru: 'Буфер остатка', uz: 'Qoldiq buferi' },
  cutoff: { ru: 'Отсечка (ЧЧ:ММ)', uz: 'Kesim (SS:DD)' },
  apiUrl: { ru: 'Адрес приёма остатков', uz: 'Qoldiqlarni qabul qilish manzili' },
  sellHere: { ru: 'Продавать в этом канале', uz: 'Shu kanalda sotish' },
  linkCatalog: { ru: 'Связать каталог', uz: "Katalogni bog'lash" },
  save: { ru: 'Сохранить', uz: 'Saqlash' },
};

const label = { display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' } as const;
const input = { width: '100%', padding: '6px 8px' } as const;

export function AdminChannelCard({
  channel,
  onSave,
  onLink,
  busy,
  lang,
}: {
  channel: ChannelView;
  onSave: (patch: Partial<ChannelView> & { code: string }) => void;
  onLink: (code: string) => void;
  busy: boolean;
  lang: 'ru' | 'uz';
}) {
  const t = (k: keyof typeof T) => T[k][lang];
  const [draft, setDraft] = useState(channel);
  const feed = FEED_URL[channel.code];

  const set = <K extends keyof ChannelView>(key: K, value: ChannelView[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 'var(--font-bold)' }}>{lang === 'ru' ? channel.name : channel.nameUz}</span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {channel.kind} · {channel.syncMode}
          {!channel.allowsPerishable && t('perishable')}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-sm)', color: draft.isActive ? 'var(--success)' : 'var(--text-muted)' }}>
          {draft.isActive ? t('on') : t('off')}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
        <span>{t('cards')}: {channel.listings}</span>
        <span>{t('orders30')}: {channel.orders30d}</span>
        <span>{t('revenue')}: {money(channel.revenue30d)} {sumLabel(lang)}</span>
        {channel.queued > 0 && <span>{t('queued')}: {channel.queued}</span>}
        {channel.lastSyncAt && <span>{t('synced')}: {new Date(channel.lastSyncAt).toLocaleString('ru-RU')}</span>}
      </div>

      {channel.lastError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--warning)' }}>
          <AlertTriangle size={14} /> {channel.lastError}
        </div>
      )}

      {feed && (
        // 36 px: адрес выгрузки открывают пальцем с телефона, а строка
        // текста высотой в 22 px — это прицел мыши, а не пальца.
        <a href={feed} target="_blank" rel="noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 36, fontSize: 'var(--text-sm)', color: 'var(--brand-primary)' }}>
          <ExternalLink size={14} /> {feed}
        </a>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-2)' }}>
        <label style={label}>
          {t('cities')}
          <input style={input} value={draft.cities.join(', ')}
            onChange={(e) => set('cities', e.target.value.split(',').map((c) => c.trim()).filter(Boolean))} />
        </label>
        <label style={label}>
          {t('markup')}
          <input style={input} type="number" value={draft.markupPercent}
            onChange={(e) => set('markupPercent', Number(e.target.value))} />
        </label>
        <label style={label}>
          {t('buffer')}
          <input style={input} type="number" min={0} value={draft.stockBuffer}
            onChange={(e) => set('stockBuffer', Number(e.target.value))} />
        </label>
        <label style={label}>
          {t('cutoff')}
          <input style={input} value={draft.orderCutoff ?? ''} placeholder="18:00"
            onChange={(e) => set('orderCutoff', e.target.value || null)} />
        </label>
        {channel.syncMode === 'api' && (
          <label style={{ ...label, gridColumn: '1 / -1' }}>
            {t('apiUrl')}
            <input style={input} value={draft.apiUrl ?? ''} placeholder="https://…"
              onChange={(e) => set('apiUrl', e.target.value || null)} />
          </label>
        )}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)' }}>
          <input type="checkbox" checked={draft.isActive}
            onChange={(e) => set('isActive', e.target.checked)} />
          {t('sellHere')}
        </label>
        {/* Связать каталог — только у каналов, которые вообще торгуют.
            У фидовых карточка не нужна: они берут весь активный каталог
            из выгрузки, а не из таблицы листингов. */}
        {channel.syncMode !== 'feed' && (
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onLink(channel.code)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Link2 size={14} /> {t('linkCatalog')}
          </button>
        )}
        <button className="btn btn-sm" disabled={busy} onClick={() => onSave({ ...draft, code: channel.code })}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Check size={14} /> {t('save')}
        </button>
      </div>
    </div>
  );
}
