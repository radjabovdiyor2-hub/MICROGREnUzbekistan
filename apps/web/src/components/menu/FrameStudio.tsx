'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { drawFrame, FRAME_W, FRAME_H, type FrameBrand, type FrameContent } from '@/lib/magazine/frame';
import { FrameStudioCamera } from './FrameStudioCamera';
import { FrameStudioPreview } from './FrameStudioPreview';
import { trackEvent, getSessionId } from '@/lib/magazine/track';

/* ─────────────────────────────────────────────
   Кадр гостя: камера → фирменная рамка → сторис.
   Полноэкранный видоискатель (AppShell отдаёт этот роут без хрома сайта).
   ───────────────────────────────────────────── */

type Stage = 'camera' | 'preview' | 'sent';

interface Props {
  slug: string;
  dishCode: number;
  brand: FrameBrand;
  content: FrameContent;
}

export function FrameStudio({ slug, dishCode, brand, content }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const blobRef = useRef<Blob | null>(null);

  const [stage, setStage] = useState<Stage>('camera');
  const [error, setError] = useState<string | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);

  const accent = brand.brandPrimary || 'var(--brand-primary)';

  // Логотип грузим заранее: в момент снимка ждать сеть нельзя
  useEffect(() => {
    if (!brand.logo) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { logoRef.current = img; };
    img.src = brand.logo;
  }, [brand.logo]);

  useEffect(() => {
    trackEvent({ type: 'frame_open', slug });
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => { /* автоплей может потребовать жеста */ });
        }
      } catch {
        setError('Нужен доступ к камере. Разрешите его в настройках браузера и обновите страницу.');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [slug]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawFrame(ctx, video, video.videoWidth, video.videoHeight, brand, content, logoRef.current);

    canvas.toBlob((blob) => {
      if (!blob) return;
      blobRef.current = blob;
      setShotUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setStage('preview');
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (navigator.vibrate) navigator.vibrate(20);
    }, 'image/jpeg', 0.92);
  }, [brand, content]);

  const fileName = `fresh-weekly-${slug}-${dishCode}.jpg`;

  const share = useCallback(async () => {
    const blob = blobRef.current;
    if (!blob) return;
    const file = new File([blob], fileName, { type: 'image/jpeg' });
    // Web Share с файлами есть не везде — молча откатываемся на скачивание
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: `${content.dishName} · ${brand.name}` });
        trackEvent({ type: 'photo_shared', slug });
        return;
      } catch {
        return; // пользователь закрыл системный диалог — это не ошибка
      }
    }
    const a = document.createElement('a');
    a.href = shotUrl!;
    a.download = fileName;
    a.click();
    trackEvent({ type: 'photo_shared', slug });
  }, [brand.name, content.dishName, fileName, shotUrl, slug]);

  const submit = useCallback(async () => {
    const blob = blobRef.current;
    if (!blob || !consent) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append('file', new File([blob], fileName, { type: 'image/jpeg' }));
      form.append('slug', slug);
      form.append('dishCode', String(dishCode));
      form.append('sessionId', getSessionId());
      form.append('consent', 'true');
      if (guestName) form.append('guestName', guestName);
      const res = await fetch('/api/menu/photo', { method: 'POST', body: form });
      if (!res.ok) throw new Error(await res.text());
      setStage('sent');
    } catch {
      setError('Не удалось отправить кадр. Проверьте интернет и попробуйте ещё раз.');
    } finally {
      setSending(false);
    }
  }, [consent, dishCode, fileName, guestName, slug]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgb(var(--overlay-dark-rgb))', zIndex: 9999, fontFamily: "'Inter', sans-serif" }}>
      <canvas ref={canvasRef} width={FRAME_W} height={FRAME_H} style={{ display: 'none' }} />

      {/* ── Видоискатель ── */}
      {stage === 'camera' && (
        <FrameStudioCamera
          videoRef={videoRef} content={content} brand={brand} slug={slug}
          dishCode={dishCode} error={error} accent={accent} capture={capture}
        />
      )}

      {/* ── Готовый кадр ── */}
      {stage === 'preview' && shotUrl && (
        <FrameStudioPreview
          shotUrl={shotUrl} accent={accent} guestName={guestName} setGuestName={setGuestName}
          consent={consent} setConsent={setConsent} sending={sending} error={error}
          share={share} submit={submit} btnStyle={btn}
        />
      )}

      {/* ── Отправлено ── */}
      {stage === 'sent' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', gap: 14,
        }}>
          <div style={{ fontSize: 56 }}>✨</div>
          <h2 style={{ color: 'var(--text-inverse)', fontSize: 22, fontWeight: 800 }}>Кадр отправлен</h2>
          <p style={{ color: 'rgba(var(--overlay-light-rgb), 0.65)', fontSize: 14, lineHeight: 1.6, maxWidth: 320 }}>
            Он участвует в отборе в следующий номер. Загляните в журнал через неделю —
            вдруг там вы.
          </p>
          <Link href={`/m/${slug}`} style={{ ...btn(accent), textDecoration: 'none', marginTop: 10 }}>
            ← В меню {brand.name}
          </Link>
        </div>
      )}
    </div>
  );
}

function btn(background: string, color = 'rgb(var(--overlay-light-rgb))'): React.CSSProperties {
  return {
    display: 'block', width: '100%', padding: '15px 20px', borderRadius: 16,
    background, color, fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
    border: background === 'transparent' ? `1px solid ${color}` : 'none',
    cursor: 'pointer', textAlign: 'center',
  };
}
