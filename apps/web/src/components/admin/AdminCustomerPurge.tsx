'use client';

import { useState } from 'react';
import { Eraser, Eye, Loader2 } from 'lucide-react';

import { useFeedback } from './AdminFeedback';
import { AdminNotice } from './AdminNotice';

// ══════════════════════════════════════════════════════════════════════
// Чистка базы клиентов — с предпросмотром.
//
// В `DELETE /api/admin/customers` есть два пакетных режима и, главное,
// РЕЖИМ ПРОСМОТРА (`dryRun`): он показывает, что именно уйдёт, и не удаляет
// ничего. Это единственный «мягкий» механизм во всей админке — и у него не
// было ни одной кнопки. Владелец мог удалять только по одной карточке, а
// ночной сбор заведений приносит их сотнями.
//
// ПОРЯДОК ЗДЕСЬ ЖЁСТКИЙ: сначала посмотреть, потом удалять. Кнопка удаления
// появляется только после просмотра и только для того же режима — иначе
// предпросмотр превращается в украшение, которое нажимают не глядя.
//
// Удаление МЯГКОЕ: карточка помечается `deleted_at`, а не стирается.
// Пакетная чистка перестала быть необратимой — а именно необратимость и
// делала её страшной: сотни карточек за нажатие, и «удалил не тот набор»
// означало собрать всё заново ночным обходом, потеряв ручные правки.
//
// «Подозрительные» (`suspects`) показываются отдельно и НЕ удаляются: это
// карточки, у которых учебное слово в названии, но тип другой. Их смотрят
// глазами — автоматика тут ошибётся.
// ══════════════════════════════════════════════════════════════════════

interface PreviewRow {
  id: number;
  name: string | null;
  companyName: string | null;
  city: string | null;
  companyType: string | null;
  district: string | null;
}

interface PurgeResult {
  matched?: number;
  deleted?: number;
  kept?: number;
  preview?: PreviewRow[];
  suspects?: PreviewRow[];
  message?: string;
}

type Scope = 'retired-types' | 'no-orders';

type Phrase = { ru: string; uz: string };

const SCOPES: { id: Scope; title: Phrase; hint: Phrase; hasPreview: boolean }[] = [
  {
    id: 'retired-types',
    title: { ru: 'Выведенные типы заведений', uz: 'Chiqarilgan muassasa turlari' },
    hint: {
      ru: 'Вузы, колледжи, бизнес-центры, супермаркеты, клиники — их набрал ночной сбор, пока эти категории были в справочнике. Карточку с заказом, аккаунтом или работой продавца чистка не трогает.',
      uz: "Oliygohlar, kollejlar, biznes-markazlar, supermarketlar, klinikalar — bu toifalar ma'lumotnomada turganda ularni tungi yig'uv to'plagan. Buyurtmasi, akkaunti yoki sotuvchi ishi bor kartaga tozalash tegmaydi.",
    },
    hasPreview: true,
  },
  {
    id: 'no-orders',
    title: { ru: 'Карточки без единого заказа', uz: 'Birorta buyurtmasiz kartalar' },
    hint: {
      ru: 'Для сценария «удалим и заведём заново». Клиентов с заказами не тронет — вместе с ними ушла бы история продаж.',
      uz: "«O'chiramiz va qaytadan kiritamiz» holati uchun. Buyurtmasi bor mijozlarga tegmaydi — ular bilan birga sotuv tarixi ham ketardi.",
    },
    hasPreview: false,
  },
];

const T = {
  purge: { ru: 'Чистка базы', uz: 'Bazani tozalash' },
  purgeFull: { ru: 'Чистка базы клиентов', uz: 'Mijozlar bazasini tozalash' },
  close: { ru: 'Закрыть', uz: 'Yopish' },
  showWhat: { ru: 'Показать, что удалится', uz: "Nima o'chishini ko'rsatish" },
  choose: { ru: 'Выбрать', uz: 'Tanlash' },
  deleting: { ru: 'Удаляю…', uz: "O'chirilmoqda…" },
  remove: { ru: 'Удалить', uz: "O'chirish" },
  failed: { ru: 'Не получилось', uz: "Bo'lmadi" },
  willGo: { ru: 'Уйдут', uz: 'Ketadi' },
  checkByEye: {
    ru: 'Посмотреть глазами — автоматически НЕ удаляются',
    uz: "Ko'z bilan ko'rib chiqing — avtomatik O'CHIRILMAYDI",
  },
  removed: { ru: 'Удалено', uz: "O'chirildi" },
};

const confirmTitle = {
  ru: (count: number) => `Удалить ${count} карточек?`,
  uz: (count: number) => `${count} ta karta o'chirilsinmi?`,
};

const confirmDetail = {
  ru: 'Карточки скроются отовсюду: из списка, карты, поиска и рассылок. Удаление мягкое — карточка помечается, а не стирается, и клиент, вернувшийся с заказом, снова оживит свою.',
  uz: "Kartalar hamma joydan yashiriladi: ro'yxatdan, xaritadan, qidiruvdan va tarqatmalardan. O'chirish yumshoq — karta belgilanadi, o'chirilmaydi, va buyurtma bilan qaytgan mijoz o'zinikini qayta tiriltiradi.",
};

function rowTitle(r: PreviewRow): string {
  return [r.companyName || r.name || `#${r.id}`, r.district || r.city].filter(Boolean).join(' · ');
}

export function AdminCustomerPurge({ onDone, lang }: { onDone: () => void; lang: 'ru' | 'uz' }) {
  const notify = useFeedback();
  const t = (k: keyof typeof T) => T[k][lang];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [scope, setScope] = useState<Scope | null>(null);
  const [result, setResult] = useState<PurgeResult | null>(null);

  const call = async (target: Scope, dryRun: boolean): Promise<PurgeResult | null> => {
    setBusy(dryRun ? 'preview' : 'delete');
    setError('');
    try {
      const url = `/api/admin/customers?scope=${target}${dryRun ? '&dryRun=1' : ''}`;
      const res = await fetch(url, { method: 'DELETE', credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t('failed'));
      return data as PurgeResult;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed'));
      return null;
    } finally {
      setBusy('');
    }
  };

  const preview = async (target: Scope) => {
    setScope(target);
    setResult(await call(target, true));
  };

  const purge = async (target: Scope) => {
    const count = result?.matched ?? 0;
    const ok = await notify.confirm({
      title: confirmTitle[lang](count),
      detail: confirmDetail[lang],
      confirmText: t('remove'),
      danger: true,
    });
    if (!ok) return;

    const data = await call(target, false);
    if (!data) return;
    notify.success(data.message || `${t('removed')}: ${data.deleted ?? 0}`);
    setResult(null);
    setScope(null);
    onDone();
  };

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Eraser size={14} /> {t('purge')}
      </button>
    );
  }

  return (
    <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
        <h3 style={{ fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Eraser size={16} /> {t('purgeFull')}
        </h3>
        <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); setResult(null); setScope(null); }}>
          {t('close')}
        </button>
      </div>

      <AdminNotice>{error}</AdminNotice>

      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        {SCOPES.map((s) => (
          <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
            <div style={{ fontWeight: 'var(--font-semibold)', marginBottom: 4 }}>{s.title[lang]}</div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>{s.hint[lang]}</p>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {s.hasPreview ? (
                <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => preview(s.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {busy === 'preview' && scope === s.id ? <Loader2 size={14} className="spin" /> : <Eye size={14} />}
                  {t('showWhat')}
                </button>
              ) : (
                <button className="btn btn-sm" disabled={Boolean(busy)}
                  onClick={() => { setScope(s.id); setResult({ matched: 0 }); }}>
                  {t('choose')}
                </button>
              )}
              {scope === s.id && result && (
                <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => purge(s.id)}
                  style={{ border: '1px solid var(--error)', color: 'var(--error)' }}>
                  {busy === 'delete' ? t('deleting') : t('remove')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {result?.message && (
        <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>{result.message}</p>
      )}

      {Boolean(result?.preview?.length) && (
        <PreviewList title={t('willGo')} rows={result!.preview!} tone="var(--error)" />
      )}
      {Boolean(result?.suspects?.length) && (
        <PreviewList
          title={t('checkByEye')}
          rows={result!.suspects!}
          tone="var(--warning)"
        />
      )}
    </div>
  );
}

function PreviewList({ title, rows, tone }: { title: string; rows: PreviewRow[]; tone: string }) {
  return (
    <div style={{ marginTop: 'var(--space-3)' }}>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: tone, marginBottom: 6 }}>
        {title} ({rows.length})
      </div>
      <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        {rows.map((r) => (
          <div key={r.id} style={{ padding: '6px 10px', fontSize: 'var(--text-sm)', borderBottom: '1px solid var(--border)' }}>
            {rowTitle(r)}
            {r.companyType && (
              <span style={{ color: 'var(--text-muted)' }}> · {r.companyType}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
