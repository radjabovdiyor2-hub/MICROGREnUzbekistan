'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, CheckCircle2, ClipboardList, Plus, Trash2 } from 'lucide-react';

import { AdminCheckbox } from './AdminCheckbox';
import { AdminSelectionBar } from './AdminSelectionBar';
import { AdminSearch, matchesQuery } from './AdminSearch';

// ══════════════════════════════════════════════════════════════════════
// Задачи отделам.
//
// Вкладки отделов показывали доску только на чтение: поставить задачу
// боту можно было исключительно из Telegram, написав Стёпану.
//
// Задача не просто пишется в таблицу — она уходит событием в шину, где
// её подхватывает бот отдела. Если офис недоступен, честно говорим, что
// задача сохранена, но исполнитель не уведомлён.
//
// Удаление — поштучно и пачкой: отмена оставляет строку в таблице навсегда,
// а разбирать приходится именно мусор (дубли одного поручения, задачи
// отделам, которых нет). Каскадов у Task в схеме нет.
// ══════════════════════════════════════════════════════════════════════

import { AdminTaskForm } from './AdminTaskForm';
import { AdminTaskRow } from './AdminTaskRow';
import { DEPT_LABELS } from './adminTasksConfig';
import { useAdminTasks } from './useAdminTasks';

export function AdminTasks({ lang = 'ru', focus = '' }: { lang?: 'ru' | 'uz'; focus?: string }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);

  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('sales');
  const [priority, setPriority] = useState('medium');
  const [deadline, setDeadline] = useState('');
  const [description, setDescription] = useState('');

  const {
    tasks, departments, loading, msg, selected, setSelected,
    create, setStatus, toggle, remove, bulkStatus,
  } = useAdminTasks(filter, t);

  // Поиска по задачам не было — только фильтр по отделу. Тридцать открытых
  // задач ищутся глазами, и «где та про субстрат» стоит прокрутки.
  // useMemo здесь не про скорость, а про ТОЖДЕСТВЕННОСТЬ ссылки. Без него
  // новый массив на каждый рендер, эффект ниже видит «зависимость
  // изменилась» всегда — и его приходилось глушить подавлением линтера,
  // перечисляя зависимости вручную. Перечисленные руками зависимости
  // расходятся с телом эффекта молча: добавят условие в фильтр, забудут
  // строку в списке, и выбор перестанет чиститься.
  const visible = useMemo(
    () => tasks.filter(x => matchesQuery(query, x.title, x.description, x.department, x.assignee)),
    [tasks, query],
  );

  // Выбрано ли всё ВИДИМОЕ. Считается по текущему списку, а не по всей
  // базе: фильтр меняет то, что перед человеком, и «выбрать всё» обязано
  // означать «всё, что я вижу».
  const allVisibleSelected = visible.length > 0 && visible.every(x => selected.includes(x.id));

  // Смена фильтра или поиска не должна оставлять в выборе то, чего уже не
  // видно: иначе «Удалить выбранные» уносит записи, которых нет на экране.
  useEffect(() => {
    setSelected(prev => {
      const next = prev.filter(id => visible.some(x => x.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [visible, setSelected]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await create({ title, department, priority, deadline, description });
    if (!ok) return;
    setTitle(''); setDescription(''); setDeadline('');
    setShowForm(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)',
    borderRadius: 10, background: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)', outline: 'none',
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="all">{t('Все отделы', 'Barcha bo\'limlar')}</option>
          {departments.map(d => <option key={d} value={d}>{DEPT_LABELS[d] ?? d}</option>)}
        </select>

        <AdminSearch value={query} onChange={setQuery}
          placeholder={t('Поиск задачи', 'Vazifa qidirish')} width={200} />

        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary"
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> {t('Поставить задачу', 'Vazifa qo\'yish')}
        </button>
      </div>

      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, fontSize: 'var(--text-sm)', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
          background: msg.type === 'ok' ? 'var(--success-bg)' : msg.type === 'warn' ? 'var(--warning-bg)' : 'var(--error-bg)',
          color: msg.type === 'ok' ? 'var(--success)' : msg.type === 'warn' ? 'var(--warning)' : 'var(--error)',
        }}>
          {msg.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />} {msg.text}
        </div>
      )}

      {/* «Выбрать всё» — то, чего не было: тридцать просроченных задач
          закрывались тридцатью нажатиями. Выбирается ВИДИМОЕ, то есть с
          учётом фильтра: человек нажимает, глядя на список перед собой. */}
      {visible.length > 0 && (
        <label style={{
          display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 14,
          fontSize: 'var(--text-xs)', color: 'var(--text-muted)', cursor: 'pointer',
        }}>
          <AdminCheckbox
            checked={allVisibleSelected}
            indeterminate={selected.length > 0}
            onChange={() => setSelected(allVisibleSelected ? [] : visible.map(x => x.id))}
            label={t('Выбрать все видимые задачи', "Barcha ko'rinadigan vazifalarni tanlash")}
          />
          {allVisibleSelected
            ? t('Снять выбор со всех', 'Barchasidan olib tashlash')
            : t(`Выбрать все (${visible.length})`, `Barchasini tanlash (${visible.length})`)}
        </label>
      )}

      <AdminSelectionBar count={selected.length} onClear={() => setSelected([])} lang={lang}>
        {/* Массовая смена статуса: раньше тридцать задач закрывались
            тридцатью нажатиями по одной. */}
        <button className="btn btn-sm btn-ghost"
          style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => bulkStatus(selected, 'done')}>
          <CheckCircle size={15} /> {t('Выполнено', 'Bajarildi')}
        </button>
        <button
          className="btn btn-sm btn-ghost"
          style={{ color: 'var(--error)', display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => remove(
            selected,
            t(`Удалить ${selected.length} задач(и) безвозвратно?`, `${selected.length} ta vazifa butunlay o'chirilsinmi?`),
          )}>
          <Trash2 size={15} /> {t('Удалить', "O'chirish")}
        </button>
      </AdminSelectionBar>

      {showForm && (
        <AdminTaskForm
          create={submit} title={title} setTitle={setTitle} department={department}
          setDepartment={setDepartment} priority={priority} setPriority={setPriority}
          deadline={deadline} setDeadline={setDeadline} description={description}
          setDescription={setDescription} departments={departments} t={t} inputStyle={inputStyle}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-6)' }}>
            {t('Загрузка…', 'Yuklanmoqda…')}
          </div>
        ) : visible.map(task => (
          <AdminTaskRow
            key={task.id} task={task} today={today} inputStyle={inputStyle} t={t}
            selected={selected.includes(task.id)}
            highlight={focus !== '' && String(task.id) === focus}
            onToggle={toggle}
            onStatus={setStatus}
            onDelete={x => remove(
              [x.id],
              t(`Удалить задачу «${x.title}» безвозвратно?`, `«${x.title}» butunlay o'chirilsinmi?`),
            )}
          />
        ))}

        {!loading && !visible.length && (
          <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <ClipboardList size={28} style={{ marginBottom: 8 }} />
            <div>{t('Активных задач нет', 'Faol vazifalar yo\'q')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
