'use client';

import { Sprout } from 'lucide-react';

import { useLang } from '@/components/providers/LangProvider';
import { CONTACT } from '@/lib/site';
import { useInstagramPosts } from './useInstagramPosts';

// ══════════════════════════════════════════════════════════════════════
// «Ваша ферма» — как это выглядит на самом деле.
//
// СНИМКИ БЕРУТСЯ ИЗ INSTAGRAM, а не лежат в репозитории: своих фотографий
// производства, команды, сбора и упаковки в проекте нет ни одной.
//
// ПОЧЕМУ ПО МЕТКЕ, А НЕ «ПОСЛЕДНИЕ ЧЕТЫРЕ». Первая версия брала свежие
// кадры ленты — и на бою под заголовком «Как мы выращиваем» оказались
// фотография встречи с представителем ООН и два рекламных плаката про
// салаты. Ни теплицы, ни срезки, ни упаковки. Блок утверждал то, чего не
// показывал, и заметить это на стенде было нельзя: там нет токена, лента
// молчит, блок гаснет и выглядит исправным.
//
// Лента ведётся живьём и содержит всё подряд — встречи, объявления,
// рекламу, процесс. Отличить процесс от остального может только тот, кто
// постит. Поэтому выбор за ним: пост с меткой попадает сюда, без метки —
// нет. Владелец управляет блоком оттуда, где и так работает, а соврать
// блок больше не может: нечего показать — нечего и утверждать.
//
// БЛОК ГАСНЕТ САМ в трёх случаях: нет токена, лента молчит, ни один пост
// не помечен. Во всех трёх заголовок над пустотой был бы хуже отсутствия.
// ══════════════════════════════════════════════════════════════════════

/**
 * Метки, по которым пост считается кадром с производства.
 *
 * Несколько написаний намеренно: человек, ставящий метку с телефона между
 * делом, не обязан помнить единственно верное. Раскладка и язык меняются,
 * а пропущенный из-за регистра пост выглядит как поломка блока.
 */
const FARM_TAGS = ['#ferma', '#ферма', '#jarayon', '#процесс', '#teplitsa', '#теплица'];

/** Помечен ли пост как кадр с производства. */
export function isFarmPost(caption: string | undefined): boolean {
  if (!caption) return false;
  const text = caption.toLowerCase();
  return FARM_TAGS.some((tag) => text.includes(tag));
}

/** Сколько кадров показываем. Четыре — ряд на десктопе, два на два на телефоне. */
const SHOTS = 4;

export function FarmSection() {
  const { t } = useLang();
  // Общий источник с лентой ниже: два своих запроса тянули один и тот же
  // ответ дважды.
  const { data } = useInstagramPosts();

  // Только НАСТОЯЩИЕ посты: запасные — синтетика, и выдавать их за кадры
  // с фермы нельзя, ради этого блок и заводился.
  // Видео пропускаем: обложка у него приходит отдельным полем, и без неё
  // в сетке оказался бы чёрный прямоугольник.
  const posts = (data?.isReal ? data.posts : [])
    .filter((p) => p.mediaUrl && p.mediaType !== 'VIDEO' && isFarmPost(p.caption))
    .slice(0, SHOTS);

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
            'Teplitsa, kesish va qadoqlash — Instagram lentamizdan.',
            'Теплица, срезка и упаковка — кадры из нашей ленты.',
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
