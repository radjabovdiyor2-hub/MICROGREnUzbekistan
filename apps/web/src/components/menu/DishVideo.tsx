'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  videoUrl: string | null;
  videoPoster: string | null;
  photo: string | null;
  alt: string;
  fullScreen?: boolean;
}

export function DishVideo({ videoUrl, videoPoster, photo, alt, fullScreen = false }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [showPauseIcon, setShowPauseIcon] = useState(false);

  const toggleSound = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!ref.current) return;
    const nextMuted = !isMuted;
    ref.current.muted = nextMuted;
    setIsMuted(nextMuted);
    if (!nextMuted && ref.current.paused) {
      ref.current.play().catch(() => {});
    }
  };

  const togglePlayPause = () => {
    if (!ref.current) return;
    if (ref.current.paused) {
      ref.current.play().catch(() => {});
      setIsPaused(false);
    } else {
      ref.current.pause();
      setIsPaused(true);
    }
    setShowPauseIcon(true);
    setTimeout(() => setShowPauseIcon(false), 600);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el || !videoUrl) return;
    el.play().catch(() => {});
  }, [videoUrl]);

  // — Fullscreen video (Reels-style) —
  if (videoUrl && !failed && fullScreen) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        zIndex: 0,
        background: '#000',
        overflow: 'hidden',
        animation: 'reels-fade-in 0.6s ease-out both',
      }}>
        <video
          ref={ref}
          src={videoUrl}
          poster={videoPoster ?? photo ?? undefined}
          muted={isMuted}
          playsInline
          autoPlay
          loop
          preload="auto"
          controls={false}
          aria-label={alt}
          onError={() => setFailed(true)}
          onClick={togglePlayPause}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            cursor: 'pointer',
          }}
        />

        {/* Pause indicator — like Reels */}
        {showPauseIcon && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'reels-pulse-play 0.6s ease-out forwards',
            pointerEvents: 'none',
          }}>
            <span style={{ fontSize: 32, color: '#fff', marginLeft: isPaused ? 4 : 0 }}>
              {isPaused ? '▶' : '⏸'}
            </span>
          </div>
        )}

        {/* Sound toggle — small circle like Reels */}
        <button
          type="button"
          onClick={toggleSound}
          aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
          style={{
            position: 'absolute',
            top: 'calc(env(safe-area-inset-top, 16px) + 16px)',
            right: 16,
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            fontSize: 18,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20,
            padding: 0,
          }}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
      </div>
    );
  }

  // — Fullscreen photo (Reels-style, when no video) —
  if (fullScreen) {
    if (!photo) return null;
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        zIndex: 0,
        background: '#000',
        overflow: 'hidden',
        animation: 'reels-fade-in 0.6s ease-out both',
      }}>
        <img
          src={photo}
          alt={alt}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </div>
    );
  }

  // — Inline video (non-fullscreen, used in menu listing) —
  if (videoUrl && !failed) {
    return (
      <div style={{ position: 'relative', margin: '16px 0' }}>
        <video
          ref={ref}
          src={videoUrl}
          poster={videoPoster ?? photo ?? undefined}
          muted={isMuted}
          playsInline
          autoPlay
          loop
          preload="auto"
          controls={false}
          aria-label={alt}
          onError={() => setFailed(true)}
          onClick={toggleSound}
          style={{
            width: '100%',
            aspectRatio: '9 / 16',
            objectFit: 'cover',
            borderRadius: 20,
            display: 'block',
            cursor: 'pointer',
            background: 'var(--bg-elevated, rgba(255,255,255,0.03))',
          }}
        />
        <button
          type="button"
          onClick={toggleSound}
          aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
          style={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(10px)',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: 30,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            zIndex: 5,
          }}
        >
          {isMuted ? '🔊 Включить звук' : '🔇 Выключить звук'}
        </button>
      </div>
    );
  }

  // — Inline photo fallback —
  if (!photo) return null;

  return (
    <img
      src={photo}
      alt={alt}
      style={{
        width: '100%',
        aspectRatio: '4 / 3',
        objectFit: 'cover',
        borderRadius: 20,
        margin: '16px 0',
      }}
    />
  );
}
