'use client';

import { useState } from 'react';
import { AdminSearch, matchesQuery } from './AdminSearch';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock, Edit, Plus, Send, Trash, User,
} from 'lucide-react';
import { AdminNotice } from './AdminNotice';
import { useFeedback } from './AdminFeedback';
import { CITIES, DEPARTMENTS, EMPLOYEE_ROLES, employeeRoleLabel } from './employeeOptions';

interface Employee {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  department: string | null;
  city: string | null;
  /** Строкой, а не числом: BigInt не переживает JSON. */
  telegramId: string | null;
  isActive: boolean;
  todaySalesCount: number;
  todayRevenue: number;
}

const EMPTY_EMPLOYEE = {
  name: '', pin: '', phone: '', role: 'seller', department: '', city: 'samarqand',
  telegramId: '',
};

/** Цвет плашки должности. */
const ROLE_TONE: Record<string, { bg: string; fg: string }> = {
  manager: { bg: 'var(--info-bg)', fg: 'var(--info)' },
  grower: { bg: 'var(--brand-primary-light)', fg: 'var(--brand-primary)' },
};

export function AdminEmployees({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  // Экран был одноязычным, при том что соседние разделы админки написаны
  // по-русски, а кнопка переключения языка в сайдбаре есть.
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const notify = useFeedback();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_EMPLOYEE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Поиска здесь не было: сотрудников ищут по имени и телефону.
  const [query, setQuery] = useState('');

  const { data: employees = [], isLoading: loading } = useQuery<Employee[]>({
    queryKey: ['admin-employees'],
    queryFn: async () => {
      const res = await fetch('/api/inventory/employees');
      const data = await res.json();
      return data.employees || [];
    }
  });

  const fetch_ = () => queryClient.invalidateQueries({ queryKey: ['admin-employees'] });

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  const handleSave = async () => {
    if (!form.name || (!editId && !form.pin)) return;
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const method = editId ? 'PUT' : 'POST';
      const body = editId ? { id: editId, ...form } : form;
      const res = await fetch('/api/inventory/employees', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setShowAdd(false);
        setEditId(null);
        setForm(EMPTY_EMPLOYEE);
        fetch_();
        return;
      }
      setError(data?.error || `Server ${res.status}`);
    } catch {
      // Сетевой отказ уходил в консоль, и форма просто оставалась открытой:
      // человек не знал, сохранилось или нет, и жал «Сохранить» ещё раз.
      setError("Tarmoq xatosi — qayta urinib ko'ring");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Увольнение. Вопрос называет человека и последствие.
   *
   * Было «O'chirishni tasdiqlaysizmi?» — ни имени, ни того, что уходит
   * вместе с карточкой. Две кнопки по 28 пикселей стоят в четырёх
   * пикселях друг от друга, и правая из них — эта.
   */
  const handleDelete = async (emp: Employee) => {
    const ok = await notify.confirm({
      title: lang === 'ru'
        ? `Удалить «${emp.name}» из списка?`
        : `«${emp.name}» ro'yxatdan o'chirilsinmi?`,
      detail: t(
        'Его PIN перестанет работать. История смен и продаж сохранится.',
        "Uning PIN kodi ishlamay qoladi. Smenalar va sotuvlar tarixi saqlanadi.",
      ),
      confirmText: t('Удалить', "O'chirish"),
      danger: true,
    });
    if (!ok) return;

    notify.undoable({
      text: t(`Удаляю «${emp.name}»…`, `«${emp.name}» o'chirilmoqda…`),
      undoneText: t('Отменено — сотрудник на месте', 'Bekor qilindi'),
      run: async () => {
        setError('');
        const res = await fetch(`/api/inventory/employees?id=${emp.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error || `Server ${res.status}`);
          return;
        }
        fetch_();
      },
    });
  };

  const visible = employees.filter((e) =>
    matchesQuery(query, e.name, e.phone, e.role, e.department, e.city));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <User size={20} /> {t('Сотрудники', 'Xodimlar')}
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 'var(--font-normal)' }}>({visible.length})</span>
        </h3>
        <AdminSearch value={query} onChange={setQuery} placeholder={t('Поиск сотрудника', 'Xodim qidirish')} width={180} />
        <button onClick={() => { setShowAdd(!showAdd); setEditId(null); setForm(EMPTY_EMPLOYEE); }}
          className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Plus size={14} /> {t('Новый сотрудник', 'Yangi xodim')}
        </button>
      </div>

      <AdminNotice>{error}</AdminNotice>

      {/* Add/Edit Form */}
      {showAdd && (
        <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <h4 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)' }}>
            {editId ? t('Правка', 'Tahrirlash') : t('Новый сотрудник', 'Yangi xodim')}
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
            <input placeholder={t('Имя *', 'Ism *')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }} />
            <input placeholder={t('PIN (4 цифры) *', 'PIN (4 raqam) *')} value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))} maxLength={4}
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-display)', letterSpacing: 8 }} />
            <input placeholder={t('Телефон', 'Telefon')} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }} />
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
              {EMPLOYEE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {/* Отдел и город: колонки в базе есть, график смен их показывает,
                а задать их было негде — поэтому они всегда оставались пустыми. */}
            <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
              <option value="">Bo&apos;lim…</option>
              {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <select value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
              {CITIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            {/* Telegram ID: по нему сотрудник входит в кассу из бота одним
                касанием, без PIN. Колонка была в базе с самого начала и
                оставалась пустой — заполнить её было негде. */}
            <input placeholder={t('Telegram ID (вход в кассу без PIN)', 'Telegram ID (kassaga PINsiz kirish)')}
              value={form.telegramId}
              onChange={e => setForm(f => ({ ...f, telegramId: e.target.value.replace(/\D/g, '') }))}
              inputMode="numeric"
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }} />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm">
              {saving ? t('Сохраняю…', 'Saqlanmoqda…') : t('Сохранить', 'Saqlash')}
            </button>
            <button onClick={() => { setShowAdd(false); setEditId(null); }} className="btn btn-ghost btn-sm">{t('Отмена', 'Bekor')}</button>
          </div>
        </div>
      )}

      {/* Employee Cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          <Clock size={32} style={{ animation: 'pulse 1.5s infinite' }} />
        </div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          <User size={48} style={{ opacity: 0.3, marginBottom: 'var(--space-2)' }} />
          <p>{t('Сотрудников нет. Добавьте нового.', "Xodimlar yo'q. Yangi xodim qo'shing.")}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {visible.map(emp => (
            <div key={emp.id} className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-full)', background: 'var(--brand-primary-light)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-lg)', fontFamily: 'var(--font-display)' }}>
                  {emp.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'var(--font-bold)' }}>{emp.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                    {/* Должность подписываем по справочнику, а не двумя ветками
                        тернарника: третья должность в них не помещалась и
                        показывалась «продавцом» — карточка врала о человеке. */}
                    <span style={{ padding: '1px 6px', borderRadius: 'var(--radius-full)', background: ROLE_TONE[emp.role]?.bg ?? 'var(--success-bg)', color: ROLE_TONE[emp.role]?.fg ?? 'var(--success)', fontSize: '10px', fontWeight: 'var(--font-bold)' }}>
                      {employeeRoleLabel(emp.role)}
                    </span>
                    {emp.phone && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{emp.phone}</span>}
                    {/* Видно сразу, кому не надо вбивать PIN на морозе. */}
                    {emp.telegramId && (
                      <span title="Входит из Telegram без PIN"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: '10px', fontWeight: 'var(--font-bold)', color: 'var(--info)' }}>
                        <Send size={10} /> Telegram
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => { setEditId(emp.id); setForm({ name: emp.name, pin: '', phone: emp.phone || '', role: emp.role, department: emp.department || '', city: emp.city || 'samarqand', telegramId: emp.telegramId || '' }); setShowAdd(true); }}
                    className="btn btn-ghost btn-sm" style={{ width: 28, height: 28, padding: 0 }}>
                    <Edit size={14} />
                  </button>
                  <button onClick={() => handleDelete(emp)}
                    className="btn btn-ghost btn-sm" style={{ width: 28, height: 28, padding: 0, color: 'var(--error)' }}>
                    <Trash size={14} />
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                <div style={{ textAlign: 'center', padding: 'var(--space-2)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('Продаж сегодня', 'Bugungi sotish')}</div>
                  <div style={{ fontWeight: 'var(--font-bold)' }}>{emp.todaySalesCount} ta</div>
                </div>
                <div style={{ textAlign: 'center', padding: 'var(--space-2)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('Выручка сегодня', 'Bugungi tushum')}</div>
                  <div style={{ fontWeight: 'var(--font-bold)', color: 'var(--success)' }}>{fmt(emp.todayRevenue)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
