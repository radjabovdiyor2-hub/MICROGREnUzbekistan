'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Share2 } from 'lucide-react';
import { useState } from 'react';

import { AdminNotice } from './AdminNotice';
import { useFeedback } from './AdminFeedback';
import { AdminChannelCard, type ChannelView } from './AdminChannelCard';

// ══════════════════════════════════════════════════════════════════════
// Каналы продаж — где мы продаём, кроме собственной витрины.
//
// Экран отвечает на три вопроса владельца: что включено, сколько это
// принесло за месяц и почему канал молчит. Последнее важнее всего:
// площадка без остатков продолжает продавать то, чего нет, а узнать об
// этом иначе можно только по отменённому заказу и штрафу.
//
// Каналы показываются ВСЕ, включая незаведённые: их нельзя включить,
// если экран показывает только уже существующие строки в базе.
// ══════════════════════════════════════════════════════════════════════

interface ChannelsResponse {
  channels: ChannelView[];
  revenueDays: number;
}

export function AdminChannels({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const queryClient = useQueryClient();
  const notify = useFeedback();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, isPending } = useQuery<ChannelsResponse>({
    queryKey: ['admin-channels'],
    queryFn: async () => {
      const res = await fetch('/api/admin/channels', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(t('Не удалось загрузить каналы', "Kanallarni yuklab bo'lmadi"));
      return res.json();
    },
  });

  const reload = () => queryClient.invalidateQueries({ queryKey: ['admin-channels'] });

  const save = async (patch: Partial<ChannelView> & { code: string }) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/channels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json())?.error || t('Не получилось сохранить', "Saqlab bo'lmadi"));
      notify.success(t('Канал сохранён', 'Kanal saqlandi'));
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не получилось', "Bo'lmadi"));
    } finally {
      setBusy(false);
    }
  };

  const link = async (code: string) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/channels/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ code }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || t('Не получилось связать каталог', "Katalogni bog'lab bo'lmadi"));
      // Пропущенный скоропорт называем прямо: иначе «создано 0» на
      // площадке без доставки свежего выглядит поломкой.
      const skipped = result.skippedPerishable
        ? `, ${t('скоропорт пропущен', "tez buziladigan o'tkazildi")}: ${result.skippedPerishable}`
        : '';
      notify.success(`${t('Добавлено карточек', "Kartalar qo'shildi")}: ${result.created}${skipped}. ${t('Всего', 'Jami')}: ${result.total}`);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не получилось', "Bo'lmadi"));
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/channels', { method: 'POST', credentials: 'same-origin' });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || t('Синхронизация не прошла', "Sinxronlash o'tmadi"));
      // Говорим и о том, что ждёт человека: строки для площадок без API
      // никуда не уйдут сами, и «отправлено 0» без объяснения выглядит
      // поломкой, хотя это очередь на выгрузку в кабинет.
      notify.success(
        `${t('Отправлено', 'Yuborildi')}: ${result.sent}. ${t('Ждут выгрузки руками', "Qo'lda yuklashni kutmoqda")}: ${result.waitingForHuman ?? result.waiting ?? 0}`,
      );
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не получилось', "Bo'lmadi"));
    } finally {
      setBusy(false);
    }
  };

  const channels = data?.channels ?? [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Share2 size={24} /> {t('Каналы продаж', 'Sotuv kanallari')}
        </h2>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button className="btn btn-sm" disabled={busy} onClick={syncNow}>
            {t('Синхронизировать сейчас', 'Hozir sinxronlash')}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={reload}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} /> {t('Обновить', 'Yangilash')}
          </button>
        </div>
      </div>

      <AdminNotice>{error}</AdminNotice>

      {isPending && <div style={{ color: 'var(--text-muted)' }}>{t('Загрузка…', 'Yuklanmoqda…')}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {channels.map((channel) => (
          <AdminChannelCard key={channel.code} channel={channel} onSave={save} onLink={link} busy={busy} lang={lang} />
        ))}
      </div>
    </div>
  );
}
