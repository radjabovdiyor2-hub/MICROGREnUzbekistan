'use client';

import { useEffect, useRef, useState } from 'react';

// ════════════════════════════════════════════════════════════
// «Живое меню»: блюдо на странице, куда ведёт печатный QR.
// Есть ролик — играем его, нет — прежнее фото. Вёрстка в обоих случаях
// на месте, потому что видео появится не у всех блюд сразу.
//
// Почему так, а не autoPlay loop:
//  · preload="none" + постер — пока гость не долистал, качается только
//    картинка. Ролики отдаёт тот же сервер без CDN, а гость сидит в зале
//    с мобильного интернета;
//  · один проход без зацикливания — на стыке склейки виден скачок, и
//    повтор еды раздражает. Замираем на финальном кадре с готовым блюдом,
//    он же постер;
//  · muted обязателен: автовоспроизведение в мобильных браузерах работает
//    только для беззвучного видео.
// ════════════════════════════════════════════════════════════

interface Props {
  videoUrl: string | null;
  videoPoster: string | null;
  photo: string | null;
  alt: string;
}

export function DishVideo({ videoUrl, videoPoster, photo, alt }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
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

    // Без IntersectionObserver (старый браузер) просто играем сразу
    if (typeof IntersectionObserver === 'undefined') {
      el.play().catch(() => { /* автозапуск мог быть запрещён — останется постер */ });
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();               // один запуск за жизнь страницы
        el.play().catch(() => { /* остаётся постер, и это нормально */ });
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [videoUrl]);

  const radius = 20;

  // Битый или отсутствующий ролик не должен оставлять пустое место
  if (videoUrl && !failed) {
    return (
      <div style={{ position: 'relative', margin: '16px 0' }}>
        <video
          ref={ref}
          src={videoUrl}
          poster={videoPoster ?? photo ?? undefined}
          muted={isMuted}
          playsInline
          preload="none"
          controls={false}
          aria-label={alt}
          onError={() => setFailed(true)}
          onClick={toggleSound}
          style={{
            width: '100%',
            aspectRatio: '9 / 16',
            objectFit: 'cover',
            borderRadius: radius,
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
        borderRadius: radius,
        margin: '16px 0',
      }}
    />
  );
}
