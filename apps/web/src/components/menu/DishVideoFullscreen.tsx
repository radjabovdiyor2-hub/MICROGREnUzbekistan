'use client';

import React from 'react';
import { SpeakerSlash, SpeakerWave, PlayIcon, PauseIcon } from './dishVideoIcons';

const VIBRANCY = 'var(--surface-vibrancy)';
const VIBRANCY_BORDER = 'rgba(var(--overlay-light-rgb), 0.18)';
const BLUR = 'saturate(180%) blur(20px)';

export function DishVideoFullscreen({
  videoRef,
  progressRef,
  videoUrl,
  videoPoster,
  photo,
  alt,
  isMuted,
  isPaused,
  showPauseIcon,
  progress,
  onError,
  onTogglePlayPause,
  onToggleSound,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  progressRef: React.RefObject<HTMLDivElement | null>;
  videoUrl: string;
  videoPoster: string | null;
  photo: string | null;
  alt: string;
  isMuted: boolean;
  isPaused: boolean;
  showPauseIcon: boolean;
  progress: number;
  onError: () => void;
  onTogglePlayPause: () => void;
  onToggleSound: (e?: React.MouseEvent) => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        zIndex: 0,
        background: 'rgb(var(--overlay-dark-rgb))',
        overflow: 'hidden',
        animation: 'reels-fade-in 0.8s cubic-bezier(0.25, 0.1, 0.25, 1) both',
      }}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        poster={videoPoster ?? photo ?? undefined}
        muted={isMuted}
        playsInline
        autoPlay
        loop
        preload="auto"
        controls={false}
        aria-label={alt}
        onError={onError}
        onClick={onTogglePlayPause}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          cursor: 'pointer',
        }}
      />

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
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            background: 'rgba(var(--overlay-light-rgb), 0.85)',
            borderRadius: '0 1.5px 1.5px 0',
            transition: 'width 0.25s linear',
          }}
        />
      </div>

      {showPauseIcon && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 15,
          }}
        >
          <div
            style={{
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
            }}
          >
            {isPaused ? <PlayIcon /> : <PauseIcon />}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onToggleSound}
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
