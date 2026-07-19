'use client';

import { useState, useEffect } from 'react';
import * as Icons from '@/components/ui/Icons';
import { adminFetch } from '@/lib/adminClient';
import { SlotEditor } from '@/components/admin/magazine/SlotEditor';
import { PrintCenterTab } from '@/components/admin/magazine/PrintCenterTab';
import { BriefTab } from '@/components/admin/magazine/BriefTab';

type Tab = 'brief' | 'restaurants' | 'editions' | 'assembly' | 'leads' | 'advertisers' | 'printcenter';

const TABS: { id: Tab; label: string }[] = [
  { id: 'brief', label: '🔥 Брифинг недели' },
  { id: 'restaurants', label: 'Рестораны-партнёры' },
  { id: 'editions', label: 'Выпуск недели' },
  { id: 'assembly', label: 'Сборка' },
  { id: 'leads', label: 'Заявки (печать)' },
  { id: 'advertisers', label: 'Рекламодатели' },
  { id: 'printcenter', label: 'Print Center' },
];

export function AdminMagazine() {
  const [tab, setTab] = useState<Tab>('restaurants');

  return (
    <div style={{ padding: 'var(--space-6)' }}>
      <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-6)' }}>Управление Журналом · FRESH WEEKLY</h2>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-6)', borderBottom: '1px solid var(--border-color)', paddingBottom: 'var(--space-2)', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: 'var(--space-2) var(--space-4)',
            background: tab === t.id ? 'var(--brand-primary)' : 'transparent',
            color: tab === t.id ? '#fff' : 'var(--text-primary)',
            borderRadius: 'var(--radius-md)', fontWeight: 'var(--font-semibold)', border: 'none', cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'brief' && <BriefTab />}
      {tab === 'restaurants' && <RestaurantsTab />}
      {tab === 'editions' && <EditionsTab />}
      {tab === 'assembly' && <AssemblyTab />}
      {tab === 'leads' && <LeadsTab />}
      {tab === 'advertisers' && <AdvertisersTab />}
      {tab === 'printcenter' && <PrintCenterTab />}
    </div>
  );
}

// ════════════════════ РЕСТОРАНЫ-ПАРТНЁРЫ (онбординг) ════════════════════
const emptyRestaurant = {
  id: '', name: '', slug: '', city: 'samarkand', tier: 'premium',
  logo: '', instagram: '', brandPrimary: '#2d5a27', brandAccent: '#c9a84c',
  promoCode: '', promoDiscount: 10, menuItems: [] as string[], phone: '', contactName: '',
};

function RestaurantsTab() {
  const [list, setList] = useState<any[]>([]);
  const [form, setForm] = useState({ ...emptyRestaurant });
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setList(await (await adminFetch('/api/admin/magazine/restaurants')).json()); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.url) setForm((f) => ({ ...f, logo: data.url }));
    } finally { setUploading(false); }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form, menuItems: Array.isArray(form.menuItems) ? form.menuItems : String(form.menuItems).split(',').map((s) => s.trim()).filter(Boolean) };
    if (editing && form.id) {
      await adminFetch('/api/admin/magazine/restaurants', { method: 'PATCH', body: JSON.stringify(payload) });
    } else {
      await adminFetch('/api/admin/magazine/restaurants', { method: 'POST', body: JSON.stringify(payload) });
    }
    setForm({ ...emptyRestaurant }); setEditing(false); load();
  };

  const edit = (r: any) => { setForm({ ...emptyRestaurant, ...r, menuItems: r.menuItems || [] }); setEditing(true); };
  const remove = async (id: string) => {
    if (!confirm('Удалить ресторан?')) return;
    await adminFetch(`/api/admin/magazine/restaurants?id=${id}`, { method: 'DELETE' }); load();
  };

  if (loading) return <div>Загрузка...</div>;

  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <h3 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)' }}>{editing ? 'Редактирование ресторана' : 'Новый ресторан-партнёр'}</h3>
      <form onSubmit={save} style={{ display: 'grid', gap: 'var(--space-3)', background: 'var(--bg-secondary)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <input required className="input" placeholder="Название ресторана" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="slug (латиницей, напр. ora)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          <select className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
            <option value="samarkand">Самарканд</option>
            <option value="tashkent">Ташкент</option>
          </select>
          <select className="input" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
            <option value="premium">Premium</option>
            <option value="traditional">Traditional</option>
            <option value="cafe">Cafe</option>
            <option value="tourist">Tourist</option>
          </select>
          <input className="input" placeholder="Instagram @handle" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} />
          <input className="input" placeholder="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="input" placeholder="Промокод (напр. ORA10)" value={form.promoCode} onChange={(e) => setForm({ ...form, promoCode: e.target.value })} />
          <input className="input" type="number" placeholder="Скидка %" value={form.promoDiscount} onChange={(e) => setForm({ ...form, promoDiscount: Number(e.target.value) })} />
        </div>

        <label style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
          <span>Фирменные цвета:</span>
          <span>Основной <input type="color" value={form.brandPrimary} onChange={(e) => setForm({ ...form, brandPrimary: e.target.value })} /></span>
          <span>Акцент <input type="color" value={form.brandAccent} onChange={(e) => setForm({ ...form, brandAccent: e.target.value })} /></span>
        </label>

        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <label style={{ cursor: 'pointer', background: 'var(--bg-primary)', border: '1px dashed var(--border-color)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
            {uploading ? 'Загрузка...' : 'Загрузить логотип'}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
          </label>
          {form.logo && <img src={form.logo} alt="logo" style={{ height: 40, borderRadius: 4 }} />}
        </div>

        <textarea className="input" placeholder="Блюда меню через запятую (контекст для ИИ)" rows={2}
          value={Array.isArray(form.menuItems) ? form.menuItems.join(', ') : form.menuItems}
          onChange={(e) => setForm({ ...form, menuItems: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button type="submit" style={{ background: 'var(--success)', color: '#fff', padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>{editing ? 'Сохранить' : 'Добавить'}</button>
          {editing && <button type="button" onClick={() => { setForm({ ...emptyRestaurant }); setEditing(false); }} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}>Отмена</button>}
        </div>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
            <th style={{ padding: 'var(--space-2)' }}>Ресторан</th>
            <th style={{ padding: 'var(--space-2)' }}>slug</th>
            <th style={{ padding: 'var(--space-2)' }}>Промокод</th>
            <th style={{ padding: 'var(--space-2)' }}>Цвета</th>
            <th style={{ padding: 'var(--space-2)' }}>Действия</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
              <td style={{ padding: 'var(--space-2)', fontWeight: 'bold' }}>{r.name}</td>
              <td style={{ padding: 'var(--space-2)' }}>{r.slug || '—'}</td>
              <td style={{ padding: 'var(--space-2)' }}>{r.promoCode ? `${r.promoCode} (−${r.promoDiscount || 10}%)` : '—'}</td>
              <td style={{ padding: 'var(--space-2)' }}>
                <span style={{ display: 'inline-block', width: 14, height: 14, background: r.brandPrimary || '#2d5a27', borderRadius: 3, marginRight: 3 }} />
                <span style={{ display: 'inline-block', width: 14, height: 14, background: r.brandAccent || '#c9a84c', borderRadius: 3 }} />
              </td>
              <td style={{ padding: 'var(--space-2)', display: 'flex', gap: '8px' }}>
                <button onClick={() => edit(r)} style={{ background: 'transparent', border: 'none', color: 'var(--brand-primary)', cursor: 'pointer' }}>Изменить</button>
                <button onClick={() => remove(r.id)} style={{ background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer' }}><Icons.Trash size={16} /></button>
              </td>
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={5} style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)' }}>Нет ресторанов</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ════════════════════ ВЫПУСК НЕДЕЛИ (общий 50%) ════════════════════
function EditionsTab() {
  const [list, setList] = useState<any[]>([]);
  const [sel, setSel] = useState<any | null>(null);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [form, setForm] = useState({ weekNumber: '', title: '', coverTheme: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => { setList(await (await adminFetch('/api/admin/magazine/editions')).json()); };
  useEffect(() => { load(); }, []);

  const select = (ed: any) => { setSel(ed); setBlocks(ed.sharedSpec?.blocks || []); };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await adminFetch('/api/admin/magazine/editions', { method: 'POST', body: JSON.stringify({ weekNumber: Number(form.weekNumber), title: form.title, coverTheme: form.coverTheme }) });
    setForm({ weekNumber: '', title: '', coverTheme: '' }); load();
  };

  const saveBlocks = async () => {
    if (!sel) return;
    setSaving(true);
    try {
      await adminFetch('/api/admin/magazine/editions', { method: 'PATCH', body: JSON.stringify({ id: sel.id, sharedSpec: { blocks } }) });
      await load();
    } finally { setSaving(false); }
  };

  const togglePublish = async (ed: any) => {
    await adminFetch('/api/admin/magazine/editions', { method: 'PATCH', body: JSON.stringify({ id: ed.id, isPublished: !ed.isPublished }) });
    load();
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 'var(--space-4)' }}>
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <h3 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)' }}>Выпуски</h3>
        <form onSubmit={create} style={{ display: 'grid', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          <input required className="input" type="number" placeholder="№ недели" value={form.weekNumber} onChange={(e) => setForm({ ...form, weekNumber: e.target.value })} />
          <input className="input" placeholder="Заголовок" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className="input" placeholder="Тема обложки" value={form.coverTheme} onChange={(e) => setForm({ ...form, coverTheme: e.target.value })} />
          <button type="submit" style={{ background: 'var(--brand-primary)', color: '#fff', padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>+ Создать выпуск</button>
        </form>
        {list.map((ed) => (
          <div key={ed.id} onClick={() => select(ed)} style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: sel?.id === ed.id ? 'var(--bg-secondary)' : 'transparent', marginBottom: '4px' }}>
            <div style={{ fontWeight: 600 }}>№{ed.weekNumber} · {ed.title}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{ed._count?.issues ?? 0} ресторанов · {ed.isPublished ? 'опубликован' : 'черновик'}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 'var(--space-4)' }}>
        {sel ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <h3 style={{ fontWeight: 'var(--font-bold)' }}>Общий контент · №{sel.weekNumber}</h3>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button onClick={() => togglePublish(sel)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}>{sel.isPublished ? 'Снять с публикации' : 'Опубликовать'}</button>
                <button onClick={saveBlocks} disabled={saving} style={{ background: 'var(--success)', color: '#fff', padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
              </div>
            </div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>Вставьте тексты от ИИ в слоты или нажмите «✨ ИИ» на блоке для черновика. Этот контент одинаков для всех ресторанов недели (50%).</p>
            <SlotEditor blocks={blocks} onChange={setBlocks} context={{ weekTheme: sel.coverTheme || sel.title }} />
          </>
        ) : <div style={{ color: 'var(--text-muted)' }}>Выберите или создайте выпуск слева.</div>}
      </div>
    </div>
  );
}

// ════════════════════ СБОРКА (персональный 50%) ════════════════════
function AssemblyTab() {
  const [editions, setEditions] = useState<any[]>([]);
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [newIssue, setNewIssue] = useState({ editionId: '', restaurantId: '' });
  const [sel, setSel] = useState<any | null>(null);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    const [e, r, i] = await Promise.all([
      adminFetch('/api/admin/magazine/editions').then((x) => x.json()),
      adminFetch('/api/admin/magazine/restaurants').then((x) => x.json()),
      adminFetch('/api/admin/magazine/issues').then((x) => x.json()),
    ]);
    setEditions(e); setRestaurants(r); setIssues(i);
  };
  useEffect(() => { loadAll(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await adminFetch('/api/admin/magazine/issues', { method: 'POST', body: JSON.stringify(newIssue) });
    if (!res.ok) { const err = await res.json(); alert(err.error || 'Ошибка'); return; }
    setNewIssue({ editionId: '', restaurantId: '' }); loadAll();
  };

  const select = (iss: any) => { setSel(iss); setBlocks(iss.spec?.blocks || []); };

  const saveBlocks = async () => {
    if (!sel) return;
    setSaving(true);
    try {
      await adminFetch('/api/admin/magazine/issues', { method: 'PATCH', body: JSON.stringify({ id: sel.id, spec: { blocks } }) });
      await loadAll();
    } finally { setSaving(false); }
  };

  const setStatus = async (status: string) => {
    if (!sel) return;
    await adminFetch('/api/admin/magazine/issues', { method: 'PATCH', body: JSON.stringify({ id: sel.id, status }) });
    loadAll();
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 'var(--space-4)' }}>
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <h3 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)' }}>Персональные выпуски</h3>
        <form onSubmit={create} style={{ display: 'grid', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          <select required className="input" value={newIssue.editionId} onChange={(e) => setNewIssue({ ...newIssue, editionId: e.target.value })}>
            <option value="">Выпуск недели…</option>
            {editions.map((ed) => <option key={ed.id} value={ed.id}>№{ed.weekNumber} · {ed.title}</option>)}
          </select>
          <select required className="input" value={newIssue.restaurantId} onChange={(e) => setNewIssue({ ...newIssue, restaurantId: e.target.value })}>
            <option value="">Ресторан…</option>
            {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button type="submit" style={{ background: 'var(--brand-primary)', color: '#fff', padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>+ Собрать выпуск</button>
        </form>
        {issues.map((iss) => (
          <div key={iss.id} onClick={() => select(iss)} style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: sel?.id === iss.id ? 'var(--bg-secondary)' : 'transparent', marginBottom: '4px' }}>
            <div style={{ fontWeight: 600 }}>{iss.restaurant?.name} · №{iss.edition?.weekNumber}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{iss.webSlug} · {iss.status}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 'var(--space-4)' }}>
        {sel ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              <h3 style={{ fontWeight: 'var(--font-bold)' }}>{sel.restaurant?.name} · персональный 50%</h3>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <a href={`/magazine/r/${sel.webSlug}`} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', textDecoration: 'none', color: 'var(--text-primary)' }}>👁 Предпросмотр</a>
                <a href={`/magazine/print/${sel.webSlug}`} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', textDecoration: 'none', color: 'var(--text-primary)' }}>🖨 Печать</a>
                <button onClick={saveBlocks} disabled={saving} style={{ background: 'var(--success)', color: '#fff', padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>{saving ? '...' : 'Сохранить'}</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Статус:</span>
              {['draft', 'ready', 'published'].map((s) => (
                <button key={s} onClick={() => setStatus(s)} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600, background: sel.status === s ? 'var(--brand-primary)' : 'var(--bg-secondary)', color: sel.status === s ? '#fff' : 'var(--text-primary)' }}>{s}</button>
              ))}
            </div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>Персональные блоки (слово шефа, обложка, семейный QR-блок) собираются с общим контентом выпуска автоматически. «✨ ИИ» генерит текст с учётом меню ресторана.</p>
            <SlotEditor blocks={blocks} onChange={setBlocks} context={{ restaurantName: sel.restaurant?.name, menuItems: sel.restaurant?.menuItems, weekTheme: sel.edition?.title, city: sel.restaurant?.city }} />
          </>
        ) : <div style={{ color: 'var(--text-muted)' }}>Выберите или соберите персональный выпуск слева.</div>}
      </div>
    </div>
  );
}

// ════════════════════ ЗАЯВКИ (print-on-demand) — без изменений логики ════════════════════
function LeadsTab() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { setLeads(await (await adminFetch('/api/admin/magazine/leads')).json()); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const togglePaid = async (id: string, isPaid: boolean) => {
    await adminFetch('/api/admin/magazine/leads', { method: 'PATCH', body: JSON.stringify({ id, isPaid: !isPaid }) });
    load();
  };
  if (loading) return <div>Загрузка...</div>;
  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <h3 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)' }}>Лиды на печатную версию</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
            <th style={{ padding: 'var(--space-2)' }}>Дата</th><th style={{ padding: 'var(--space-2)' }}>Контакт</th><th style={{ padding: 'var(--space-2)' }}>Выпуск</th><th style={{ padding: 'var(--space-2)' }}>Адрес</th><th style={{ padding: 'var(--space-2)' }}>Оплата</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
              <td style={{ padding: 'var(--space-2)' }}>{new Date(lead.createdAt).toLocaleDateString()}</td>
              <td style={{ padding: 'var(--space-2)' }}>{lead.userId || 'Неизвестно'}<div style={{ color: 'var(--text-muted)' }}>{lead.phone || ''}</div></td>
              <td style={{ padding: 'var(--space-2)' }}>№{lead.issue?.issueNumber || '?'}</td>
              <td style={{ padding: 'var(--space-2)' }}>{lead.address || '—'}</td>
              <td style={{ padding: 'var(--space-2)' }}>
                <button onClick={() => togglePaid(lead.id, lead.isPaid)} style={{ padding: '4px 8px', borderRadius: '4px', background: lead.isPaid ? 'var(--success-bg)' : 'var(--warning-bg)', color: lead.isPaid ? 'var(--success)' : 'var(--warning)', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>{lead.isPaid ? 'Оплачено' : 'Ожидает'}</button>
              </td>
            </tr>
          ))}
          {leads.length === 0 && <tr><td colSpan={5} style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)' }}>Нет заявок</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ════════════════════ РЕКЛАМОДАТЕЛИ — без изменений логики ════════════════════
function AdvertisersTab() {
  const [advertisers, setAdvertisers] = useState<any[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAdv, setNewAdv] = useState({ companyName: '', contactPerson: '', phone: '', email: '', status: 'lead', format: '', amount: 0, notes: '' });
  const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { setAdvertisers(await (await adminFetch('/api/admin/magazine/advertisers')).json()); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    await adminFetch('/api/admin/magazine/advertisers', { method: 'POST', body: JSON.stringify({ ...newAdv, amount: Number(newAdv.amount) }) });
    setShowAddForm(false); setNewAdv({ companyName: '', contactPerson: '', phone: '', email: '', status: 'lead', format: '', amount: 0, notes: '' }); load();
  };
  const remove = async (id: string) => { if (!confirm('Удалить рекламодателя?')) return; await adminFetch(`/api/admin/magazine/advertisers?id=${id}`, { method: 'DELETE' }); load(); };
  if (loading) return <div>Загрузка...</div>;
  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
        <h3 style={{ fontWeight: 'var(--font-bold)' }}>База рекламодателей</h3>
        <button onClick={() => setShowAddForm(!showAddForm)} style={{ background: 'var(--brand-primary)', color: '#fff', padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>{showAddForm ? 'Отмена' : '+ Добавить'}</button>
      </div>
      {showAddForm && (
        <form onSubmit={add} style={{ display: 'grid', gap: 'var(--space-3)', background: 'var(--bg-secondary)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <input required className="input" placeholder="Название компании" value={newAdv.companyName} onChange={(e) => setNewAdv({ ...newAdv, companyName: e.target.value })} />
            <input className="input" placeholder="Контактное лицо" value={newAdv.contactPerson} onChange={(e) => setNewAdv({ ...newAdv, contactPerson: e.target.value })} />
            <input className="input" placeholder="Телефон" value={newAdv.phone} onChange={(e) => setNewAdv({ ...newAdv, phone: e.target.value })} />
            <input className="input" placeholder="Email" value={newAdv.email} onChange={(e) => setNewAdv({ ...newAdv, email: e.target.value })} />
            <select className="input" value={newAdv.status} onChange={(e) => setNewAdv({ ...newAdv, status: e.target.value })}>
              <option value="lead">Потенциальный (Lead)</option><option value="active">Активный</option><option value="past">Архив</option>
            </select>
            <select className="input" value={newAdv.format} onChange={(e) => setNewAdv({ ...newAdv, format: e.target.value })}>
              <option value="">Без формата</option><option value="cover_ar">AR Обложка ($500)</option><option value="spread">Разворот ($300)</option><option value="page">Полоса ($150)</option>
            </select>
            <input className="input" type="number" placeholder="Сумма (UZS)" value={newAdv.amount} onChange={(e) => setNewAdv({ ...newAdv, amount: Number(e.target.value) })} />
            <input className="input" placeholder="Заметки" value={newAdv.notes} onChange={(e) => setNewAdv({ ...newAdv, notes: e.target.value })} />
          </div>
          <button type="submit" style={{ background: 'var(--success)', color: '#fff', padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>Сохранить</button>
        </form>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
            <th style={{ padding: 'var(--space-2)' }}>Компания</th><th style={{ padding: 'var(--space-2)' }}>Контакты</th><th style={{ padding: 'var(--space-2)' }}>Статус</th><th style={{ padding: 'var(--space-2)' }}>Формат</th><th style={{ padding: 'var(--space-2)' }}>Сумма</th><th style={{ padding: 'var(--space-2)' }}>Действия</th>
          </tr>
        </thead>
        <tbody>
          {advertisers.map((adv) => (
            <tr key={adv.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
              <td style={{ padding: 'var(--space-2)', fontWeight: 'bold' }}>{adv.companyName}</td>
              <td style={{ padding: 'var(--space-2)' }}>{adv.contactPerson || '—'}<div style={{ color: 'var(--text-muted)' }}>{adv.phone || adv.email || ''}</div></td>
              <td style={{ padding: 'var(--space-2)' }}>{adv.status}</td>
              <td style={{ padding: 'var(--space-2)' }}>{adv.format || '—'}</td>
              <td style={{ padding: 'var(--space-2)' }}>{adv.amount ? adv.amount.toLocaleString() + ' UZS' : '—'}</td>
              <td style={{ padding: 'var(--space-2)' }}><button onClick={() => remove(adv.id)} style={{ background: 'transparent', color: 'var(--error)', border: 'none', cursor: 'pointer' }}><Icons.Trash size={16} /></button></td>
            </tr>
          ))}
          {advertisers.length === 0 && <tr><td colSpan={6} style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)' }}>Нет рекламодателей</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
