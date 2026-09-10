'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';

import { useLang } from '@/components/providers/LangProvider';
import { MagazineIssueSpotlight } from '@/app/magazine/MagazineIssueSpotlight';
import type { IssueCard } from '@/lib/magazine/content';

// ══════════════════════════════════════════════════════════════════════
// Журнал на главной: обложка свежего номера.
//
// Переиспользует `MagazineIssueSpotlight` со страницы журнала — тот же
// вид обложки и те же две двери (читать онлайн, скачать PDF). Своя копия
// разошлась бы с оригиналом на первой правке вёрстки.
//
// НЕТ НОМЕРА — НЕТ БЛОКА. Заголовок «Журнал» над заглушкой «номер
// готовится» занимает экран и ничего не даёт: на страницу журнала ведут
// шапка и нижняя навигация.
// ══════════════════════════════════════════════════════════════════════

export function MagazineTeaser({ issue }: { issue: IssueCard | null }) {
  const { t } = useLang();
  if (!issue) return null;

  return (
    <section className="container" style={{ padding: 'var(--space-8) 0' }} id="magazine-section">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-5)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              fontWeight: 600,
            }}
          >
            <BookOpen size={14} /> FRESH WEEKLY
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 'var(--font-extrabold)',
              fontSize: 'clamp(1.4rem, 3.5vw, 2rem)',
              marginTop: 4,
            }}
          >
            {t('Bizning jurnalimiz', 'Наш журнал')}
          </h2>
        </div>

        <Link
          href="/magazine"
          className="btn btn-ghost btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          {t('Barcha sonlar', 'Все номера')} <ArrowRight size={15} />
        </Link>
      </div>

      <MagazineIssueSpotlight issue={issue} />
    </section>
  );
}
