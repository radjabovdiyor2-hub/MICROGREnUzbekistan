'use client';

import { useEffect, useState } from 'react';
import { Sprout } from 'lucide-react';

import { useLang } from '@/components/providers/LangProvider';
import { CONTACT } from '@/lib/site';
import type { InstaPost } from './instagramFeedData';

// ══════════════════════════════════════════════════════════════════════
// «Ваша ферма» — как это выглядит на самом деле.
//
// СНИМКИ БЕРУТСЯ ИЗ INSTAGRAM, а не лежат в репозитории. Своих фотографий
// производства, команды, сбора и упаковки в проекте нет ни одной: есть 75
// снимков товаров и восемь концептуальных картинок. Выдавать рендеры за
// ферму нельзя — это ровно тот случай, когда «показать процесс» становится
// показом чужого стока.
//
// Instagram при этом ведётся живьём, и его посты — настоящие. Цена решения:
// мы не выбираем, что именно покажется, — берём последние. Поэтому
// подпись честно говорит, что это лента, а не витрина отобранных кадров.
//
// БЕЗ ТОКЕНА БЛОКА НЕТ. Лента отвечает пустым списком, когда
// `INSTAGRAM_ACCESS_TOKEN` не выдан. Заголовок «Ваша ферма» над пустым
// местом хуже отсутствия блока: он обещает то, чего посетитель не увидит.
// ══════════════════════════════════════════════════════════════════════

/** Сколько кадров показываем. Четыре — ряд на десктопе, два на два на телефоне. */
const SHOTS = 4;

export function FarmSection() {
  const { t } = useLang();
  const [posts, setPosts] = useState<InstaPost[]>([]);

  useEffect(() => {
    let mounted = true;
    fetch('/api/instagram')
      .then((r) => r.json())
      .then((data) => {
        const list: InstaPost[] = Array.isArray(data.posts) ? data.posts : [];
        // Видео пропускаем: обложка у него приходит отдельным полем, и без
        // него в сетке оказался бы чёрный прямоугольник.
        const photos = list.filter((p) => p.mediaUrl && p.mediaType !== 'VIDEO');
        if (mounted) setPosts(photos.slice(0, SHOTS));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  if (posts.length === 0) return null;

  return (
    <section className="container" style={{ padding: 'var(--space-8) 0' }} id="farm-section">
      <div style={{ marginBottom: 'var(--space-5)' }}>
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
          <Sprout size={14} /> {t('Bizning fermamiz', 'Наша ферма')}
        </div>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 'var(--font-extrabold)',
            fontSize: 'clamp(1.4rem, 3.5vw, 2rem)',
            marginTop: 4,
          }}
        >
          {t('Qanday o’stiramiz', 'Как мы выращиваем')}
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)', maxWidth: '56ch' }}>
          {t(
            'Instagram lentamizdagi so’nggi kadrlar — teplitsa, kesish va qadoqlash.',
            'Последние кадры из нашей ленты: теплица, срезка и упаковка.',
          )}
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 'var(--space-3)',
        }}
      >
        {posts.map((post) => (
          <a
            key={post.id}
            href={post.permalink || CONTACT.instagram}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              border: '1px solid var(--border)',
            }}
          >
            <img
              src={post.mediaUrl}
              alt={post.caption?.slice(0, 80) || t('Fermadan kadr', 'Кадр с фермы')}
              loading="lazy"
              style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }}
            />
          </a>
        ))}
      </div>
    </section>
  );
}
