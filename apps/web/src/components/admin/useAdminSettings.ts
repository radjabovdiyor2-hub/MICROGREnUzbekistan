'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Field, Category } from './settingsTypes';

export function useAdminSettings(lang: 'ru' | 'uz') {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { data, isLoading: loading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const res = await fetch('/api/admin/settings', { credentials: 'same-origin' });
      const d = await res.json();
      if (d.status === 'ok') {
        return { fields: d.fields as Field[], categories: d.categories as Category[] };
      }
      throw new Error(d.error || t('Не удалось загрузить', 'Yuklab bo\'lmadi'));
    }
  });

  const fields = useMemo(() => data?.fields || [], [data?.fields]);
  const categories = useMemo(() => data?.categories || [], [data?.categories]);

  const dirty = Object.keys(draft);

  const save = async () => {
    if (!dirty.length) return;
    setSaving(true);
    setMsg(null);
    setFieldErrors({});
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ settings: draft }),
      });
      const data = await res.json();

      const errCount = Object.keys(data.errors ?? {}).length;
      const okCount = Object.keys(data.applied ?? {}).length;

      if (errCount) setFieldErrors(data.errors);
      if (okCount) {
        setMsg({
          type: errCount ? 'error' : 'success',
          text: errCount
            ? t(`Сохранено ${okCount}, с ошибками ${errCount}`, `${okCount} saqlandi, ${errCount} xato`)
            : t(`Сохранено настроек: ${okCount}`, `${okCount} sozlama saqlandi`),
        });
        setDraft({});
        await queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      } else {
        setMsg({ type: 'error', text: t('Ничего не сохранено', 'Hech narsa saqlanmadi') });
      }
    } catch {
      setMsg({ type: 'error', text: t('Ошибка сети', 'Tarmoq xatosi') });
    } finally {
      setSaving(false);
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return fields;
    return fields.filter(f =>
      f.labelRu.toLowerCase().includes(q) ||
      f.labelUz.toLowerCase().includes(q) ||
      f.key.toLowerCase().includes(q));
  }, [fields, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Field[]>();
    for (const f of visible) {
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category)!.push(f);
    }
    return map;
  }, [visible]);

  const current = (f: Field) => (f.key in draft ? draft[f.key] : f.value);
  const setValue = (key: string, value: unknown) => setDraft(d => ({ ...d, [key]: value }));

  return {
    fields, categories, draft, setDraft, loading, saving, search, setSearch,
    msg, fieldErrors, setFieldErrors, save, dirty, grouped, current, setValue, t,
  };
}
