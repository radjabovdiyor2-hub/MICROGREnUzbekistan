'use client';

import { StoriesViewer, type Story } from './StoriesViewer';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLang } from '@/components/providers/LangProvider';
import { motion } from 'framer-motion';

const IMAGE_DURATION = 5000;

export function StoriesBar() {
  const { t } = useLang();
  const [stories, setStories] = useState<Story[]>([]);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [progress, setProgress] = useState(0);

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
    setProgress(0);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const next = useCallback(() => {
    setIdx((i) => {
      if (i + 1 >= stories.length) { setOpen(false); return 0; }
      setProgress(0);
      return i + 1;
    });
  }, [stories.length]);

  const prev = useCallback(() => {
    setIdx((i) => Math.max(0, i - 1));
    setProgress(0);
  }, []);

  // Animate progress bar for images
  useEffect(() => {
    if (!open) return;
    const cur = stories[idx];
    if (!cur) return;
    
    if (cur.mediaType !== 'VIDEO') {
      const interval = 50; // update every 50ms
      const step = (interval / IMAGE_DURATION) * 100;
      
      timerRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev + step >= 100) {
            next();
            return 0;
          }
          return prev + step;
        });
      }, interval);
      
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [open, idx, stories, next]);

  // Esc to close
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
      {/* Stories track */}
      <div style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
        <div className="container" style={{ padding: '20px 0' }}>
          <div style={{ 
            display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '8px',
            scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch'
          }}>
            {stories.map((s, i) => (
              <motion.button
                key={s.id}
                onClick={() => { setIdx(i); setProgress(0); setOpen(true); }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  flex: '0 0 auto', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: '8px', background: 'none', border: 'none',
                  cursor: 'pointer', width: '80px',
                }}
                aria-label={`Story ${i + 1}`}
              >
                <div style={{
                  width: '80px', height: '80px', borderRadius: '50%', padding: '3px',
                  background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
                }}>
                  <div style={{
                    width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden',
                    border: '3px solid var(--bg-primary)', background: 'var(--bg-tertiary)',
                  }}>
                    <img
                      src={s.mediaUrl}
                      alt="story"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                    />
                  </div>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600 }}>
                  {t('Story', 'Сторис')} {i + 1}
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* Viewer via Portal */}
      <StoriesViewer
        open={open}
        stories={stories}
        idx={idx}
        cur={cur}
        progress={progress}
        setProgress={setProgress}
        next={next}
        prev={prev}
        close={close}
      />
    </>
  );
}
