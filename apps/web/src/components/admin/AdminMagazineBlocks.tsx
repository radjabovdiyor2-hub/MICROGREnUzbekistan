'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { AdminNotice } from './AdminNotice';
import { useFeedback } from './AdminFeedback';
import { SECTION_TITLES } from '@/lib/magazine/types';

// ══════════════════════════════════════════════════════════════════════
// Блоки персонального номера и переписывание их ИИ.
//
// ЧЕГО НЕ БЫЛО. `/api/admin/magazine/ai-draft` умеет переписать один блок
// на трёх языках, сохранив структуру и служебные поля, — и не имел ни
// одного потребителя. Содержимое номера правилось только тем, что положил
// в него крон: посмотреть, из чего номер состоит, было негде.
//
// ПЕРЕПИСАННОЕ ПОКАЗЫВАЕТСЯ ДО СОХРАНЕНИЯ. Модель пишет текст, а отвечает
// за него человек: черновик сначала виден рядом с текущим, и только нажатие
// «Заменить» кладёт его в `spec`. Автосохранение здесь означало бы, что
// номер меняется от нажатия «переписать» — и вернуть прежний текст было бы
// нечем, версий у `spec` нет.
// ══════════════════════════════════════════════════════════════════════

interface Block {
  id?: string;
  type?: string;
  [key: string]: unknown;
}

/** Первый читаемый текст блока — по нему его узнают в списке. */
function preview(block: Block): string {
  for (const key of ['title', 'heading', 'name', 'subtitle', 'text']) {
    const value = block[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (value && typeof value === 'object') {
      const ru = (value as Record<string, unknown>).ru;
      if (typeof ru === 'string' && ru.trim()) return ru;
    }
  }
  return '—';
}

export function AdminMagazineBlocks({ issueId, editionId, title, onBack, spec, lang = 'ru' }: {
  issueId: string;
  editionId: string;
  title: string;
  onBack: () => void;
  spec: { blocks?: Block[] } | null;
  lang?: 'ru' | 'uz';
}) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const queryClient = useQueryClient();
  const notify = useFeedback();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [blocks, setBlocks] = useState<Block[]>(spec?.blocks ?? []);
  const [draft, setDraft] = useState<{ index: number; block: Block } | null>(null);

  const rewrite = async (index: number) => {
    setBusy(String(index));
    setError('');
    setDraft(null);
    try {
      const res = await fetch('/api/admin/magazine/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ block: blocks[index], context: { restaurantName: title } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Не получилось');
      setDraft({ index, block: data.block });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось');
    } finally {
      setBusy('');
    }
  };

  const apply = async () => {
    if (!draft) return;
    const next = blocks.map((b, i) => (i === draft.index ? draft.block : b));
    setBusy('save');
    setError('');
    try {
      const res = await fetch('/api/admin/magazine/issues', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id: issueId, spec: { ...(spec ?? {}), blocks: next } }),
      });
      if (!res.ok) throw new Error('Не удалось сохранить номер');
      setBlocks(next);
      setDraft(null);
      notify.success(t('Блок заменён', 'Blok almashtirildi'));
      queryClient.invalidateQueries({ queryKey: ['admin-magazine-issues', editionId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось');
    } finally {
      setBusy('');
    }
  };

  return (
    <div>
      <button onClick={onBack} className="btn btn-ghost btn-sm"
        style={{ marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <ArrowLeft size={16} /> {t('К номерам', 'Sonlarga')}
      </button>

      <h3 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)' }}>
        {title} · {t('блоки', 'bloklar')} ({blocks.length})
      </h3>

      <AdminNotice>{error}</AdminNotice>

      {blocks.length === 0 && (
        <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
          {t('У номера нет блоков — его ещё не собирал конвейер.', 'Bu sonda blok yoʻq.')}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {blocks.map((block, index) => (
          <div key={block.id ?? index} className="card" style={{ padding: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 'var(--font-semibold)' }}>
                  {SECTION_TITLES[block.type as keyof typeof SECTION_TITLES] ?? block.type ?? '—'}
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                  {preview(block)}
                </div>
              </div>
              <button className="btn btn-sm" disabled={Boolean(busy)}
                onClick={() => rewrite(index)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Sparkles size={13} />
                {busy === String(index) ? t('Пишем…', 'Yozilmoqda…') : t('Переписать ИИ', 'AI qayta yozsin')}
              </button>
            </div>

            {draft?.index === index && (
              <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)' }}>
                <div style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 4 }}>
                  {t('Черновик — в номер пока не попал', 'Qoralama — songa hali kirmadi')}
                </div>
                <pre style={{ margin: 0, maxHeight: 260, overflow: 'auto', fontSize: 'var(--text-xs)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-secondary)' }}>
                  {JSON.stringify(draft.block, null, 2)}
                </pre>
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary btn-sm" disabled={busy === 'save'} onClick={apply}>
                    {t('Заменить', 'Almashtirish')}
                  </button>
                  <button className="btn btn-sm" disabled={busy === 'save'} onClick={() => setDraft(null)}>
                    {t('Отклонить', 'Rad etish')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
