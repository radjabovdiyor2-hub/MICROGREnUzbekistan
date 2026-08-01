'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  videoUrl: string | null;
  videoPoster: string | null;
  photo: string | null;
  alt: string;
  fullScreen?: boolean;
}

// Apple-style constants
const FONT = "-apple-system, 'SF Pro Text', 'SF Pro Display', 'Inter', 'Helvetica Neue', sans-serif";
const VIBRANCY = 'var(--surface-vibrancy)';
const VIBRANCY_BORDER = 'rgba(var(--overlay-light-rgb), 0.18)';
const BLUR = 'saturate(180%) blur(20px)';

// SF Symbol-style SVG icons
import { SpeakerSlash, SpeakerWave, PlayIcon, PauseIcon } from './dishVideoIcons';

export function DishVideo({ videoUrl, videoPoster, photo, alt, fullScreen = false }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [showPauseIcon, setShowPauseIcon] = useState(false);
  const [progress, setProgress] = useState(0);

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
    setTimeout(() => setShowPauseIcon(false), 700);
  };

  const updateProgress = useCallback(() => {
    const el = ref.current;
    if (!el || !el.duration) return;
    setProgress((el.currentTime / el.duration) * 100);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !videoUrl) return;
    el.play().catch(() => {});
    el.addEventListener('timeupdate', updateProgress);
    return () => el.removeEventListener('timeupdate', updateProgress);
  }, [videoUrl, updateProgress]);

  // — Fullscreen video (Apple-style) —
  if (videoUrl && !failed && fullScreen) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        zIndex: 0,
        background: 'rgb(var(--overlay-dark-rgb))',
        overflow: 'hidden',
        animation: 'reels-fade-in 0.8s cubic-bezier(0.25, 0.1, 0.25, 1) both',
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

        {/* Video progress bar — Apple-style thin line at bottom */}
        <div
          ref={progressRef}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 3,
            background: 'rgba(var(--overlay-light-rgb), 0.2)',
            zIndex: 25,
          }}
        >
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: 'rgba(var(--overlay-light-rgb), 0.85)',
            borderRadius: '0 1.5px 1.5px 0',
            transition: 'width 0.25s linear',
          }} />
        </div>

        {/* Play/Pause indicator — Apple-style vibrancy square */}
        {showPauseIcon && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 15,
          }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: VIBRANCY,
              backdropFilter: BLUR,
              WebkitBackdropFilter: BLUR,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'reels-pulse-play 0.7s cubic-bezier(0.25, 0.1, 0.25, 1) forwards',
              border: `0.5px solid ${VIBRANCY_BORDER}`,
            }}>
              {isPaused ? <PlayIcon /> : <PauseIcon />}
            </div>
          </div>
        )}

        {/* Sound toggle — Apple-style rounded square with SVG */}
        <button
          type="button"
          onClick={toggleSound}
          aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
          style={{
            position: 'absolute',
            top: 'calc(env(safe-area-inset-top, 16px) + 16px)',
            right: 16,
            width: 36,
            height: 36,
            borderRadius: 10,
            background: VIBRANCY,
            backdropFilter: BLUR,
            WebkitBackdropFilter: BLUR,
            color: 'var(--text-inverse)',
            border: `0.5px solid ${VIBRANCY_BORDER}`,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20,
            padding: 0,
          }}
        >
          {isMuted ? <SpeakerSlash /> : <SpeakerWave />}
        </button>
      </div>
    );
  }

  // — Fullscreen photo (Apple-style, when no video) —
  if (fullScreen) {
    if (!photo) return null;
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        zIndex: 0,
        background: 'rgb(var(--overlay-dark-rgb))',
        overflow: 'hidden',
        animation: 'reels-fade-in 0.8s cubic-bezier(0.25, 0.1, 0.25, 1) both',
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
            borderRadius: 16,
            display: 'block',
            cursor: 'pointer',
            background: 'var(--bg-elevated, rgba(var(--overlay-light-rgb), 0.03))',
          }}
        />
        <button
          type="button"
          onClick={toggleSound}
          aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            background: VIBRANCY,
            backdropFilter: BLUR,
            WebkitBackdropFilter: BLUR,
            color: 'var(--text-inverse)',
            border: `0.5px solid ${VIBRANCY_BORDER}`,
            borderRadius: 10,
            padding: '6px 12px',
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: -0.08,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            zIndex: 5,
          }}
        >
          {isMuted ? <SpeakerWave /> : <SpeakerSlash />}
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
        borderRadius: 16,
        margin: '16px 0',
      }}
    />
  );
}
