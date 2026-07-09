'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as Icons from '@/components/ui/Icons';
import { useLang } from '@/components/providers/LangProvider';

interface Story {
  id: string;
  mediaType: string;
  mediaUrl: string;
  permalink: string;
  timestamp: string;
}

const IMAGE_DURATION = 5000; // мс на сторис-картинку

export function StoriesBar() {
  const { t } = useLang();
  const [stories, setStories] = useState<Story[]>([]);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch('/api/instagram/stories')
      .then((r) => r.json())
      .then((data) => {
        if (mounted && data.stories?.length) setStories(data.stories);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const next = useCallback(() => {
    setIdx((i) => {
      if (i + 1 >= stories.length) { setOpen(false); return 0; }
      return i + 1;
    });
  }, [stories.length]);

  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);

  // Авто-переход для картинок (видео управляется onEnded)
  useEffect(() => {
    if (!open) return;
    const cur = stories[idx];
    if (!cur) return;
    if (cur.mediaType !== 'VIDEO') {
      timerRef.current = setTimeout(next, IMAGE_DURATION);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }
  }, [open, idx, stories, next]);

  // Esc для закрытия
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, next, prev]);

  if (!stories.length) return null;

  const cur = stories[idx];

  return (
    <>
      {/* Кружки сторис */}
      <div style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
        <div className="container" style={{ padding: 'var(--space-4) 0' }}>
          <div style={{ display: 'flex', gap: 'var(--space-4)', overflowX: 'auto', paddingBottom: 4 }}>
            {stories.map((s, i) => (
              <button
                key={s.id}
                onClick={() => { setIdx(i); setOpen(true); }}
                style={{
                  flex: '0 0 auto', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 6, background: 'none', border: 'none',
                  cursor: 'pointer', width: 76,
                }}
                aria-label={`Story ${i + 1}`}
              >
                <div style={{
                  width: 72, height: 72, borderRadius: '50%', padding: 3,
                  background: 'linear-gradient(135deg, #833AB4, #E1306C, #F77737)',
                }}>
                  <div style={{
                    width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden',
                    border: '2px solid var(--bg-primary)', background: 'var(--bg-tertiary)',
                  }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.mediaUrl}
                      alt="story"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                    />
                  </div>
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                  {t('Story', 'Сторис')} {i + 1}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Просмотрщик */}
      {open && cur && (
        <div
          onClick={next}
          style={{
            position: 'fixed', inset: 0, zIndex: 3000,
            background: 'rgba(0,0,0,0.92)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* Прогресс-бары */}
          <div style={{
            position: 'absolute', top: 12, left: 12, right: 12,
            display: 'flex', gap: 4, zIndex: 2,
          }}>
            {stories.map((_, i) => (
              <div key={i} style={{
                flex: 1, height: 3, borderRadius: 2,
                background: i < idx ? '#fff' : i === idx ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)',
              }} />
            ))}
          </div>

          {/* Закрыть */}
          <button
            onClick={(e) => { e.stopPropagation(); close(); }}
            style={{
              position: 'absolute', top: 20, right: 16, zIndex: 3,
              background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: '50%',
              width: 36, height: 36, color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Close"
          >
            <Icons.X size={20} />
          </button>

          {/* Зоны тапа влево/вправо */}
          <button onClick={(e) => { e.stopPropagation(); prev(); }}
            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', background: 'none', border: 'none', cursor: 'pointer', zIndex: 1 }}
            aria-label="Previous" />
          <button onClick={(e) => { e.stopPropagation(); next(); }}
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '30%', background: 'none', border: 'none', cursor: 'pointer', zIndex: 1 }}
            aria-label="Next" />

          {/* Медиа */}
          <div style={{ maxWidth: 440, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {cur.mediaType === 'VIDEO' ? (
              <video
                key={cur.id}
                src={cur.mediaUrl}
                autoPlay
                playsInline
                onEnded={next}
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 12 }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={cur.id}
                src={cur.mediaUrl}
                alt="story"
                style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 12, objectFit: 'contain' }}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
