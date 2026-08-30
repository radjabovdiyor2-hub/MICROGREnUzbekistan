'use client';

import { RUBRICS } from '@/lib/magazine/rubrics';
import type { MagazineIssue } from './magazineIssueTypes';

// Карточка номера: чем он называется, где лежит его вёрстка и PDF.
// Сам номер здесь не собирается — он свёрстан руками и опубликован
// скриптом в public/magazine; админка знает о нём и умеет его показать.
export function AdminMagazineIssueEditor({
  issue, restaurants, busy, note, onUpdate, onSave, onCancel, onUploadFile,
}: {
  issue: MagazineIssue;
  restaurants: { id: string; name: string }[];
  busy: boolean;
  note: string;
  onUpdate: (patch: Partial<MagazineIssue>) => void;
  onSave: () => void;
  onCancel: () => void;
  onUploadFile: (field: 'coverImage' | 'pdfUrl', file: File) => void;
}) {
  const row: React.CSSProperties = { display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' };
  const label: React.CSSProperties = { fontSize: 'var(--text-sm)', fontWeight: 600, display: 'block', marginBottom: 4 };
  const field: React.CSSProperties = { flex: 1, minWidth: 200 };

  const toggleTopic = (id: string) => {
    const has = issue.topics.includes(id);
    onUpdate({ topics: has ? issue.topics.filter((t) => t !== id) : [...issue.topics, id] });
  };

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: 820 }}>
      <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)' }}>
        {issue.id ? `Номер №${issue.number}` : 'Новый номер'}
      </h2>

      {note && (
        <div style={{ marginBottom: 'var(--space-4)', padding: '10px 14px', borderRadius: 8, background: 'var(--bg-secondary)', fontSize: 'var(--text-sm)' }}>
          {note}
        </div>
      )}

      <div style={row}>
        <div style={{ width: 120 }}>
          <label style={label}>Номер</label>
          <input className="input" type="number" min={1} value={issue.number}
            onChange={(e) => onUpdate({ number: Number(e.target.value) })} />
        </div>
        <div style={field}>
          <label style={label}>Адрес (slug)</label>
          <input className="input" value={issue.slug} placeholder="shakar-01"
            onChange={(e) => onUpdate({ slug: e.target.value })} />
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
            Так же называются файлы номера в public/magazine
          </div>
        </div>
      </div>

      <div style={row}>
        <div style={field}>
          <label style={label}>Название (рус.)</label>
          <input className="input" value={issue.titleRu} onChange={(e) => onUpdate({ titleRu: e.target.value })} />
        </div>
        <div style={field}>
          <label style={label}>Nomi (uz)</label>
          <input className="input" value={issue.titleUz ?? ''} onChange={(e) => onUpdate({ titleUz: e.target.value })} />
        </div>
      </div>

      <div style={row}>
        <div style={field}>
          <label style={label}>О чём номер (рус.)</label>
          <textarea className="input" rows={3} value={issue.summaryRu ?? ''}
            onChange={(e) => onUpdate({ summaryRu: e.target.value })} />
        </div>
        <div style={field}>
          <label style={label}>Son haqida (uz)</label>
          <textarea className="input" rows={3} value={issue.summaryUz ?? ''}
            onChange={(e) => onUpdate({ summaryUz: e.target.value })} />
        </div>
      </div>

      <div style={row}>
        <div style={field}>
          <label style={label}>Чтение онлайн (HTML)</label>
          <input className="input" value={issue.webUrl ?? ''} placeholder="/magazine/shakar-01.html"
            onChange={(e) => onUpdate({ webUrl: e.target.value })} />
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
            Вёрстку кладёт в public/magazine скрипт publish-magazine.mjs — загрузить её через админку нельзя
          </div>
        </div>
        <div style={field}>
          <label style={label}>PDF номера</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: 1, minWidth: 160 }} value={issue.pdfUrl ?? ''}
              placeholder="/magazine/shakar-01.pdf" onChange={(e) => onUpdate({ pdfUrl: e.target.value })} />
            <label className="btn btn-sm" style={{ cursor: busy ? 'wait' : 'pointer' }}>
              ⬆ Файл
              <input type="file" accept=".pdf" style={{ display: 'none' }} disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadFile('pdfUrl', f); e.target.value = ''; }} />
            </label>
          </div>
        </div>
      </div>

      <div style={row}>
        <div style={field}>
          <label style={label}>Обложка</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {issue.coverImage
              ? <img src={issue.coverImage} alt="" style={{ width: 60, height: 84, objectFit: 'cover', borderRadius: 8 }} />
              : <div style={{ width: 60, height: 84, borderRadius: 8, background: 'var(--bg-secondary)' }} />}
            <label className="btn btn-sm" style={{ cursor: busy ? 'wait' : 'pointer' }}>
              ⬆ Загрузить
              <input type="file" accept="image/*" style={{ display: 'none' }} disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadFile('coverImage', f); e.target.value = ''; }} />
            </label>
          </div>
        </div>
        <div style={field}>
          <label style={label}>Номер для заведения</label>
          <select className="input" value={issue.restaurantId ?? ''}
            onChange={(e) => onUpdate({ restaurantId: e.target.value || null })}>
            <option value="">— общий номер —</option>
            {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <label style={label}>Темы номера</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {RUBRICS.map((r) => (
            <button key={r.id} type="button" onClick={() => toggleTopic(r.id)}
              className={issue.topics.includes(r.id) ? 'btn btn-primary btn-sm' : 'btn btn-sm'}>
              {r.emoji} {r.ru}
            </button>
          ))}
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-4)' }}>
        <input type="checkbox" checked={issue.isPublished}
          onChange={(e) => onUpdate({ isPublished: e.target.checked })} />
        <span>Опубликован — виден на сайте и в боте</span>
      </label>

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button className="btn btn-primary" disabled={busy} onClick={onSave}>
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button className="btn" disabled={busy} onClick={onCancel}>Отмена</button>
      </div>
    </div>
  );
}
