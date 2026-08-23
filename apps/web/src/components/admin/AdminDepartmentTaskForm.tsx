'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Send } from 'lucide-react';

import { useFeedback } from './AdminFeedback';

// ══════════════════════════════════════════════════════════════════════
// Поставить задачу отделу — с его же экрана.
//
// ЗАЧЕМ
//
// Вкладка отдела показывала статистику и список задач и не давала сделать
// с ними НИЧЕГО: ни поставить новую, ни закрыть чужую. Владелец смотрел
// на «просрочено: 3» и уходил в общий раздел задач выбирать отдел из
// списка заново — при том, что он только что стоял на его странице.
//
// Дверь для этого была готова с самого начала: `POST /api/admin/tasks`
// сохраняет задачу и будит бота отдела через `/api/admin/dispatch-task`.
// Не хватало только формы.
//
// ПОЧЕМУ ОТВЕТ ЧИТАЕТСЯ ЦЕЛИКОМ
//
// Задача может сохраниться, а бот — не проснуться (офис недоступен). Это
// два разных исхода, и «задача создана» в этом случае обещает работу,
// которой никто не начнёт. Роут отдаёт признак `dispatched` отдельно —
// показываем его как есть.
// ══════════════════════════════════════════════════════════════════════

const PRIORITIES = [
  { id: 'low', ru: 'Низкий', uz: 'Past' },
  { id: 'medium', ru: 'Обычный', uz: 'Oddiy' },
  { id: 'high', ru: 'Высокий', uz: 'Yuqori' },
  { id: 'urgent', ru: 'Срочно', uz: 'Shoshilinch' },
];

export function AdminDepartmentTaskForm({ departmentId, lang }: {
  departmentId: string;
  lang: 'ru' | 'uz';
}) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const notify = useFeedback();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const text = title.trim();
    if (!text) {
      notify.toast(t('Напишите, что нужно сделать', 'Nima qilish kerakligini yozing'), 'warning');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/admin/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ title: text, department: departmentId, priority }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        notify.error(data?.error || t('Задача не создана', 'Vazifa yaratilmadi'));
        return;
      }

      setTitle('');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin-department', departmentId] });
      queryClient.invalidateQueries({ queryKey: ['admin-tasks'] });

      // Разные исходы — разные слова. Молчать про непроснувшегося бота
      // нельзя: владелец будет ждать реакции, которой не будет.
      if (data?.dispatched === false) {
        notify.toast(
          t('Задача создана, но бот отдела не уведомлён — ИИ-офис недоступен',
            "Vazifa yaratildi, lekin bo'lim boti xabardor emas — AI-ofis mavjud emas"),
          'warning',
        );
      } else {
        notify.success(t('Задача поставлена отделу', "Vazifa bo'limga qo'yildi"));
      }
    } catch {
      notify.error(t('Нет связи с сервером', "Server bilan aloqa yo'q"));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Plus size={14} /> {t('Поставить задачу', "Vazifa qo'yish")}
      </button>
    );
  }

  return (
    <div className="card" style={{ padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)' }}>
      <input
        className="input"
        autoFocus
        value={title}
        maxLength={500}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
        placeholder={t('Что нужно сделать?', 'Nima qilish kerak?')}
        aria-label={t('Название задачи', 'Vazifa nomi')}
        style={{ minHeight: 44 }}
      />

      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          aria-label={t('Приоритет', 'Muhimlik')}
          className="input"
          style={{ minHeight: 44, flex: '0 0 auto', width: 'auto' }}
        >
          {PRIORITIES.map((p) => (
            <option key={p.id} value={p.id}>{p[lang]}</option>
          ))}
        </select>

        <div style={{ flex: 1 }} />

        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          {t('Отмена', 'Bekor')}
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={busy}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
          {t('Поставить', "Qo'yish")}
        </button>
      </div>
    </div>
  );
}
