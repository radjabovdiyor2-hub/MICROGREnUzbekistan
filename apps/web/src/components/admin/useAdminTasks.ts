'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useFeedback } from './AdminFeedback';
import type { Task } from './AdminTaskRow';

// ══════════════════════════════════════════════════════════════════════
// Загрузка и правка задач отделам. Вынесено из AdminTasks: экран отвечает
// за разметку, хук — за запросы и за то, ЧТО показать владельцу в баннере.
//
// Каждая мутация обязана сообщать об ошибке. Смена статуса раньше ответ
// сервера не читала вовсе: селект молча возвращался к прежнему значению,
// и владелец считал, что статус изменён.
// ══════════════════════════════════════════════════════════════════════

export type Banner = { type: 'ok' | 'warn' | 'error'; text: string } | null;

interface NewTask {
  title: string; department: string; priority: string;
  deadline: string; description: string;
}

export function useAdminTasks(filter: string, t: (ru: string, uz: string) => string) {
  const notify = useFeedback();
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState<Banner>(null);
  const [selected, setSelected] = useState<number[]>([]);

  const { data, isLoading: loading } = useQuery({
    queryKey: ['admin-tasks', filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('department', filter);
      const res = await fetch(`/api/admin/tasks?${params}`, { credentials: 'same-origin' });
      const d = await res.json();
      if (d.status === 'ok') {
        return { tasks: d.tasks as Task[], departments: d.departments as string[] };
      }
      throw new Error('Failed to load tasks');
    },
  });

  const load = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-tasks'] });
  };

  const create = async (form: NewTask): Promise<boolean> => {
    setMsg(null);
    try {
      const res = await fetch('/api/admin/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...form, deadline: form.deadline || null }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMsg({ type: 'error', text: body.error || t('Не удалось создать', "Yaratib bo'lmadi") });
        return false;
      }
      setMsg(
        body.warning
          ? { type: 'warn', text: body.warning }
          : { type: 'ok', text: t('Задача поставлена и отправлена боту отдела', "Vazifa bo'lim botiga yuborildi") },
      );
      await load();
      return true;
    } catch {
      setMsg({ type: 'error', text: t('Ошибка сети', 'Tarmoq xatosi') });
      return false;
    }
  };

  const setStatus = async (task: Task, status: string) => {
    setMsg(null);
    const res = await fetch('/api/admin/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ id: task.id, status }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMsg({
        type: 'error',
        text: body.error || t('Не удалось сменить статус', "Statusni o'zgartirib bo'lmadi"),
      });
    }
    await load();
  };

  const toggle = (id: number) =>
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const remove = async (ids: number[], question: string) => {
    if (!ids.length) return;
    const agreed = await notify.confirm({
      title: question,
      detail: ids.length > 1 ? `Задач к удалению: ${ids.length}.` : undefined,
      confirmText: 'Удалить',
      danger: true,
    });
    if (!agreed) return;
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/tasks?ids=${ids.join(',')}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const body = await res.json();
      if (!res.ok) {
        setMsg({ type: 'error', text: body.error || t('Не удалось удалить', "O'chirib bo'lmadi") });
        return;
      }
      setSelected(prev => prev.filter(id => !ids.includes(id)));
      setMsg(
        body.warning
          ? { type: 'warn', text: body.warning }
          : { type: 'ok', text: t(`Удалено задач: ${body.deleted}`, `O'chirildi: ${body.deleted}`) },
      );
      await load();
    } catch {
      setMsg({ type: 'error', text: t('Ошибка сети', 'Tarmoq xatosi') });
    }
  };

  return {
    tasks: data?.tasks || [],
    departments: data?.departments || [],
    loading, msg, setMsg, selected, setSelected,
    create, setStatus, toggle, remove,
  };
}
