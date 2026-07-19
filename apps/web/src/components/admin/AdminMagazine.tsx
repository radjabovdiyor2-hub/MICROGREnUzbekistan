'use client';

import { useState, useEffect } from 'react';
import * as Icons from '@/components/ui/Icons';

export function AdminMagazine() {
  const [activeTab, setActiveTab] = useState<'leads' | 'advertisers'>('leads');
  const [leads, setLeads] = useState<any[]>([]);
  const [advertisers, setAdvertisers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // For new advertiser form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAdv, setNewAdv] = useState({ companyName: '', contactPerson: '', phone: '', email: '', status: 'lead', format: '', amount: 0, notes: '' });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [leadsRes, advRes] = await Promise.all([
        fetch('/api/admin/magazine/leads'),
        fetch('/api/admin/magazine/advertisers')
      ]);
      setLeads(await leadsRes.json());
      setAdvertisers(await advRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleLeadPaid = async (id: string, isPaid: boolean) => {
    await fetch('/api/admin/magazine/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isPaid: !isPaid }),
    });
    fetchData();
  };

  const handleAddAdvertiser = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/admin/magazine/advertisers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newAdv,
        amount: Number(newAdv.amount)
      }),
    });
    setShowAddForm(false);
    setNewAdv({ companyName: '', contactPerson: '', phone: '', email: '', status: 'lead', format: '', amount: 0, notes: '' });
    fetchData();
  };

  const deleteAdvertiser = async (id: string) => {
    if (!confirm('Удалить рекламодателя?')) return;
    await fetch(`/api/admin/magazine/advertisers?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  if (loading) {
    return <div style={{ padding: 'var(--space-6)' }}>Загрузка...</div>;
  }

  return (
    <div style={{ padding: 'var(--space-6)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)' }}>Управление Журналом</h2>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-6)', borderBottom: '1px solid var(--border-color)', paddingBottom: 'var(--space-2)' }}>
        <button
          onClick={() => setActiveTab('leads')}
          style={{
            padding: 'var(--space-2) var(--space-4)',
            background: activeTab === 'leads' ? 'var(--brand-primary)' : 'transparent',
            color: activeTab === 'leads' ? '#fff' : 'var(--text-primary)',
            borderRadius: 'var(--radius-md)',
            fontWeight: 'var(--font-semibold)',
          }}
        >
          Заявки (Print-on-demand)
        </button>
        <button
          onClick={() => setActiveTab('advertisers')}
          style={{
            padding: 'var(--space-2) var(--space-4)',
            background: activeTab === 'advertisers' ? 'var(--brand-primary)' : 'transparent',
            color: activeTab === 'advertisers' ? '#fff' : 'var(--text-primary)',
            borderRadius: 'var(--radius-md)',
            fontWeight: 'var(--font-semibold)',
          }}
        >
          Рекламодатели
        </button>
      </div>

      {activeTab === 'leads' && (
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)' }}>Лиды на печатную версию</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: 'var(--space-2)' }}>Дата</th>
                <th style={{ padding: 'var(--space-2)' }}>Имя / Контакт</th>
                <th style={{ padding: 'var(--space-2)' }}>Выпуск</th>
                <th style={{ padding: 'var(--space-2)' }}>Адрес доставки</th>
                <th style={{ padding: 'var(--space-2)' }}>Статус оплаты</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => (
                <tr key={lead.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: 'var(--space-2)' }}>{new Date(lead.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: 'var(--space-2)' }}>
                    <div>ID: {lead.userId || 'Неизвестно'}</div>
                    <div style={{ color: 'var(--text-muted)' }}>{lead.phone || 'Нет телефона'}</div>
                  </td>
                  <td style={{ padding: 'var(--space-2)' }}>№{lead.issue?.issueNumber || '?'}</td>
                  <td style={{ padding: 'var(--space-2)' }}>{lead.address || '—'}</td>
                  <td style={{ padding: 'var(--space-2)' }}>
                    <button
                      onClick={() => toggleLeadPaid(lead.id, lead.isPaid)}
                      style={{
                        padding: '4px 8px', borderRadius: '4px',
                        background: lead.isPaid ? 'var(--success-bg)' : 'var(--warning-bg)',
                        color: lead.isPaid ? 'var(--success)' : 'var(--warning)',
                        border: 'none', cursor: 'pointer', fontWeight: 'bold'
                      }}
                    >
                      {lead.isPaid ? 'Оплачено' : 'Ожидает'}
                    </button>
                  </td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)' }}>Нет заявок</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'advertisers' && (
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
            <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }}>База рекламодателей</h3>
            <button onClick={() => setShowAddForm(!showAddForm)} style={{
              background: 'var(--brand-primary)', color: '#fff', padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer'
            }}>
              {showAddForm ? 'Отмена' : '+ Добавить'}
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={handleAddAdvertiser} style={{ display: 'grid', gap: 'var(--space-3)', background: 'var(--bg-secondary)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <input required placeholder="Название компании" value={newAdv.companyName} onChange={e => setNewAdv({...newAdv, companyName: e.target.value})} className="input" />
                <input placeholder="Контактное лицо" value={newAdv.contactPerson} onChange={e => setNewAdv({...newAdv, contactPerson: e.target.value})} className="input" />
                <input placeholder="Телефон" value={newAdv.phone} onChange={e => setNewAdv({...newAdv, phone: e.target.value})} className="input" />
                <input placeholder="Email" value={newAdv.email} onChange={e => setNewAdv({...newAdv, email: e.target.value})} className="input" />
                <select value={newAdv.status} onChange={e => setNewAdv({...newAdv, status: e.target.value})} className="input">
                  <option value="lead">Потенциальный (Lead)</option>
                  <option value="active">Активный</option>
                  <option value="past">Архив</option>
                </select>
                <select value={newAdv.format} onChange={e => setNewAdv({...newAdv, format: e.target.value})} className="input">
                  <option value="">Без формата</option>
                  <option value="cover_ar">AR Обложка ($500)</option>
                  <option value="spread">Разворот ($300)</option>
                  <option value="page">Полоса ($150)</option>
                </select>
                <input type="number" placeholder="Сумма (UZS)" value={newAdv.amount} onChange={e => setNewAdv({...newAdv, amount: Number(e.target.value)})} className="input" />
                <input placeholder="Заметки" value={newAdv.notes} onChange={e => setNewAdv({...newAdv, notes: e.target.value})} className="input" />
              </div>
              <button type="submit" style={{ background: 'var(--success)', color: '#fff', padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>Сохранить</button>
            </form>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: 'var(--space-2)' }}>Компания</th>
                <th style={{ padding: 'var(--space-2)' }}>Контакты</th>
                <th style={{ padding: 'var(--space-2)' }}>Статус</th>
                <th style={{ padding: 'var(--space-2)' }}>Формат</th>
                <th style={{ padding: 'var(--space-2)' }}>Сумма</th>
                <th style={{ padding: 'var(--space-2)' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {advertisers.map(adv => (
                <tr key={adv.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: 'var(--space-2)', fontWeight: 'bold' }}>{adv.companyName}</td>
                  <td style={{ padding: 'var(--space-2)' }}>
                    <div>{adv.contactPerson || '—'}</div>
                    <div style={{ color: 'var(--text-muted)' }}>{adv.phone || adv.email || ''}</div>
                  </td>
                  <td style={{ padding: 'var(--space-2)' }}>
                    <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '12px', background: adv.status === 'active' ? 'var(--success-bg)' : adv.status === 'lead' ? 'var(--warning-bg)' : 'var(--bg-secondary)', color: adv.status === 'active' ? 'var(--success)' : adv.status === 'lead' ? 'var(--warning)' : 'var(--text-muted)' }}>
                      {adv.status}
                    </span>
                  </td>
                  <td style={{ padding: 'var(--space-2)' }}>{adv.format || '—'}</td>
                  <td style={{ padding: 'var(--space-2)' }}>{adv.amount ? adv.amount.toLocaleString() + ' UZS' : '—'}</td>
                  <td style={{ padding: 'var(--space-2)' }}>
                    <button onClick={() => deleteAdvertiser(adv.id)} style={{ background: 'transparent', color: 'var(--error)', border: 'none', cursor: 'pointer' }}>
                      <Icons.Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {advertisers.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)' }}>Нет рекламодателей</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
