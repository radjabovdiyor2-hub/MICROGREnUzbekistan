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

  useEffect(() => {
    const el = ref.current;
    if (!el || !videoUrl) return;

    el.play().catch(() => {});
  }, [videoUrl]);

  if (videoUrl && !failed) {
    if (fullScreen) {
      return (
        <div style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100dvh',
          zIndex: 0,
          background: '#000',
          overflow: 'hidden',
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
            onClick={toggleSound}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              cursor: 'pointer',
            }}
          />

          {/* Кнопка включения звука */}
          <button
            type="button"
            onClick={toggleSound}
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              background: 'rgba(0, 0, 0, 0.65)',
              backdropFilter: 'blur(12px)',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              borderRadius: 30,
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
              zIndex: 10,
            }}
          >
            {isMuted ? '🔊 Включить звук' : '🔇 Без звука'}
          </button>
        </div>
      );
    }

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
