'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import { motion } from 'framer-motion';

interface Story {
  id: string;
  mediaType: string;
  mediaUrl: string;
  permalink: string;
  timestamp: string;
}

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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
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
      {open && cur && typeof document !== 'undefined' && createPortal(
        <div
          onClick={next}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.95)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(10px)'
          }}
        >
          {/* Progress bars container */}
          <div style={{
            position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: '6px', zIndex: 2, width: '100%', maxWidth: '420px', padding: '0 16px'
          }}>
            {stories.map((_, i) => (
              <div key={i} style={{
                flex: 1, height: '3px', borderRadius: '2px',
                background: 'rgba(255,255,255,0.3)', overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  background: '#fff',
                  width: i < idx ? '100%' : i === idx ? `${progress}%` : '0%',
                  transition: i === idx && cur.mediaType !== 'VIDEO' ? 'width 50ms linear' : 'none'
                }} />
              </div>
            ))}
          </div>

          {/* Close button */}
          <button
            onClick={(e) => { e.stopPropagation(); close(); }}
            style={{
              position: 'absolute', top: '32px', right: '16px', zIndex: 3,
              background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%',
              width: '40px', height: '40px', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(10px)'
            }}
          >
            ✕
          </button>

          {/* Media container */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              if (e.clientX < rect.left + rect.width / 3) prev();
              else next();
            }}
            style={{
              width: '100%', maxWidth: '420px', height: '100%', maxHeight: '850px',
              position: 'relative', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              borderRadius: '16px'
            }}
          >
            {cur.mediaType === 'VIDEO' ? (
              <video
                src={cur.mediaUrl}
                autoPlay
                playsInline
                webkit-playsinline="true"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onEnded={next}
                onTimeUpdate={(e) => {
                  const el = e.currentTarget;
                  if (el.duration) {
                    setProgress((el.currentTime / el.duration) * 100);
                  }
                }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cur.mediaUrl}
                alt="story"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
            
            {/* View on Instagram Link */}
            {cur.permalink && (
              <a 
                href={cur.permalink} 
                target="_blank" 
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute', bottom: '32px', left: '50%', transform: 'translateX(-50%)',
                  padding: '12px 24px', background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)',
                  color: '#fff', borderRadius: '30px', textDecoration: 'none',
                  fontSize: '14px', fontWeight: 600, border: '1px solid rgba(255,255,255,0.4)',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}
              >
                <Search size={16} /> Смотреть в Instagram
              </a>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
