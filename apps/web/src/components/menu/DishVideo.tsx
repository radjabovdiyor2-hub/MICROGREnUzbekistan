'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SpeakerSlash, SpeakerWave } from './dishVideoIcons';
import { DishVideoFullscreen } from './DishVideoFullscreen';

interface Props {
  videoUrl: string | null;
  videoPoster: string | null;
  photo: string | null;
  alt: string;
  fullScreen?: boolean;
}

const FONT = "-apple-system, 'SF Pro Text', 'SF Pro Display', 'Inter', 'Helvetica Neue', sans-serif";
const VIBRANCY = 'var(--surface-vibrancy)';
const VIBRANCY_BORDER = 'rgba(var(--overlay-light-rgb), 0.18)';
const BLUR = 'saturate(180%) blur(20px)';

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

  if (videoUrl && !failed && fullScreen) {
    return (
      <DishVideoFullscreen
        videoRef={ref}
        progressRef={progressRef}
        videoUrl={videoUrl}
        videoPoster={videoPoster}
        photo={photo}
        alt={alt}
        isMuted={isMuted}
        isPaused={isPaused}
        showPauseIcon={showPauseIcon}
        progress={progress}
        onError={() => setFailed(true)}
        onTogglePlayPause={togglePlayPause}
        onToggleSound={toggleSound}
      />
    );
  }

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
