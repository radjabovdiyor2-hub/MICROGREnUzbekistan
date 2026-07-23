'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { drawFrame, FRAME_W, FRAME_H, type FrameBrand, type FrameContent } from '@/lib/magazine/frame';
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

  const accent = brand.brandPrimary || '#10B981';

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
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9999, fontFamily: "'Inter', sans-serif" }}>
      <canvas ref={canvasRef} width={FRAME_W} height={FRAME_H} style={{ display: 'none' }} />

      {/* ── Видоискатель ── */}
      {stage === 'camera' && (
        <>
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, padding: '16px 20px 32px',
            background: 'linear-gradient(180deg, rgba(0,0,0,0.7), transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ color: '#fff' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{content.dishName}</div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>{brand.name}</div>
            </div>
            <Link
              href={`/m/${slug}/d/${dishCode}`}
              style={{
                padding: '8px 16px', borderRadius: 20, color: '#fff', fontSize: 13, fontWeight: 600,
                background: 'rgba(255,255,255,0.15)', textDecoration: 'none',
              }}
            >Закрыть</Link>
          </div>

          {error ? (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center',
              color: '#fff', gap: 16,
            }}>
              <div style={{ fontSize: 40 }}>📷</div>
              <p style={{ fontSize: 15, lineHeight: 1.6, opacity: 0.8 }}>{error}</p>
              <Link href={`/m/${slug}`} style={{ color: accent, fontWeight: 700, textDecoration: 'none' }}>
                ← Вернуться в меню
              </Link>
            </div>
          ) : (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, padding: '24px 20px 40px',
              background: 'linear-gradient(0deg, rgba(0,0,0,0.75), transparent)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
            }}>
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, textAlign: 'center' }}>
                Наведите на блюдо и нажмите — рамка добавится сама
              </p>
              <button
                onClick={capture}
                aria-label="Снять кадр"
                style={{
                  width: 78, height: 78, borderRadius: '50%',
                  border: `4px solid ${accent}`, background: '#fff', cursor: 'pointer',
                }}
              />
            </div>
          )}
        </>
      )}

      {/* ── Готовый кадр ── */}
      {stage === 'preview' && shotUrl && (
        <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '20px 16px 40px' }}>
          <img
            src={shotUrl}
            alt="Ваш кадр"
            style={{ width: '100%', maxWidth: 380, margin: '0 auto', display: 'block', borderRadius: 16 }}
          />
          <div style={{ maxWidth: 380, margin: '18px auto 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={share} style={btn(accent)}>📤 Сохранить / поделиться</button>

            <div style={{
              padding: 16, borderRadius: 16, background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                Хотите в следующий номер?
              </div>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
                Лучшие кадры недели печатаем в журнале FRESH WEEKLY с именем автора.
              </p>
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Как вас подписать"
                maxLength={40}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 12, marginBottom: 10,
                  background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff', fontSize: 14, fontFamily: 'inherit',
                }}
              />
              <label style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 1.5, cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                Согласен на публикацию кадра в журнале и на странице ресторана
              </label>
              <button
                onClick={submit}
                disabled={!consent || sending}
                style={{ ...btn(consent ? accent : 'rgba(255,255,255,0.12)'), marginTop: 12, opacity: consent ? 1 : 0.6 }}
              >
                {sending ? 'Отправляем...' : '✨ Отправить в журнал'}
              </button>
            </div>

            <button onClick={() => window.location.reload()} style={btn('transparent', accent)}>
              🔄 Снять заново
            </button>
            {error && <p style={{ color: '#f87171', fontSize: 13, textAlign: 'center' }}>{error}</p>}
          </div>
        </div>
      )}

      {/* ── Отправлено ── */}
      {stage === 'sent' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', gap: 14,
        }}>
          <div style={{ fontSize: 56 }}>✨</div>
          <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>Кадр отправлен</h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 1.6, maxWidth: 320 }}>
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

function btn(background: string, color = '#fff'): React.CSSProperties {
  return {
    display: 'block', width: '100%', padding: '15px 20px', borderRadius: 16,
    background, color, fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
    border: background === 'transparent' ? `1px solid ${color}` : 'none',
    cursor: 'pointer', textAlign: 'center',
  };
}
