'use client';

import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';

// Полноэкранный просмотр сторис через портал. Вынесен из StoriesBar:
// открывается поверх страницы и от самой ленты не зависит.

export interface Story {
  id: string;
  mediaType: string;
  mediaUrl: string;
  permalink: string;
  timestamp: string;
}

interface Props {
  open: boolean;
  stories: Story[];
  idx: number;
  cur: Story | undefined;
  progress: number;
  setProgress: Dispatch<SetStateAction<number>>;
  next: () => void;
  prev: () => void;
  close: () => void;
}

export function StoriesViewer({
  open, stories, idx, cur, progress, setProgress, next, prev, close,
}: Props) {
  return (
    <>
{open && cur && typeof document !== 'undefined' && createPortal(
  <div
    onClick={next}
    style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(var(--overlay-dark-rgb), 0.95)', display: 'flex',
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
          background: 'rgba(var(--overlay-light-rgb), 0.3)', overflow: 'hidden'
        }}>
          <div style={{
            height: '100%',
            background: 'rgb(var(--overlay-light-rgb))',
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
        background: 'rgba(var(--overlay-light-rgb), 0.1)', border: 'none', borderRadius: '50%',
        width: '40px', height: '40px', color: 'var(--text-inverse)', cursor: 'pointer',
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
        boxShadow: '0 20px 60px rgba(var(--overlay-dark-rgb), 0.5)',
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
            padding: '12px 24px', background: 'rgba(var(--overlay-light-rgb), 0.2)', backdropFilter: 'blur(10px)',
            color: 'var(--text-inverse)', borderRadius: '30px', textDecoration: 'none',
            fontSize: '14px', fontWeight: 600, border: '1px solid rgba(var(--overlay-light-rgb), 0.4)',
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
