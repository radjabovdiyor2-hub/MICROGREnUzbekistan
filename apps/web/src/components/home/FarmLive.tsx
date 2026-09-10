'use client';

import { useEffect, useState } from 'react';
import { Radio, Sprout } from 'lucide-react';

import { useLang } from '@/components/providers/LangProvider';
import { isOffline, isSlowLink } from '@/lib/net/connection';

// ══════════════════════════════════════════════════════════════════════
// Ферма прямо сейчас — кадр с камеры в теплице.
//
// ЗАЧЕМ ЖИВОЙ КАДР, А НЕ ФОТОГРАФИИ. Снимок можно выбрать, отретушировать
// и снять один раз в удачный день. Камера показывает то, что есть,
// включая пустые стеллажи и беспорядок, — и именно поэтому ей верят. Это
// сильнейшее доказательство из всех, что у витрины есть.
//
// ПОЧЕМУ КАДР, А НЕ ВИДЕОПОТОК. Поток с камеры браузер не играет: нужен
// перегон на сервере, круглосуточный процесс и трафик на каждого зрителя.
// На стеллажах с растущей зеленью между кадрами не происходит ничего:
// картинка раз в минуту выглядит живой и стоит почти ничего. Захочется
// движения — поверх этого же блока встанет плеер, приёмник менять не
// придётся.
//
// ГАСНЕТ, КОГДА КАМЕРА МОЛЧИТ. Приёмник отдаёт кадр только пока он свежий
// (пять минут); дальше 404, и блока нет. Показать вчерашний кадр под
// словом «сейчас» — это ровно та ошибка, из-за которой пришлось
// переделывать прошлый блок фермы: картинка настоящая, утверждение ложное.
// ══════════════════════════════════════════════════════════════════════

/** Как часто просим новый кадр. На слабой связи — вчетверо реже. */
const EVERY_MS = 60_000;
const SLOW_FACTOR = 4;

export function FarmLive() {
  const { t } = useLang();
  // Метка времени в адресе: без неё браузер возьмёт кадр из своей памяти
  // и «живая» камера замрёт на первом снимке.
  const [stamp, setStamp] = useState<number | null>(null);
  const [alive, setAlive] = useState(false);

  useEffect(() => {
    let stopped = false;

    const ask = async () => {
      if (isOffline()) return;
      try {
        // HEAD, а не GET: узнать «есть ли кадр» можно, не качая его.
        const res = await fetch('/api/farm/frame', { method: 'HEAD', cache: 'no-store' });
        if (stopped) return;
        setAlive(res.ok);
        if (res.ok) setStamp(Date.now());
      } catch {
        // Обрыв — не повод гасить уже показанный кадр: связь вернётся.
      }
    };

    void ask();
    const timer = setInterval(() => void ask(), isSlowLink() ? EVERY_MS * SLOW_FACTOR : EVERY_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  if (!alive || stamp === null) return null;

  return (
    <section className="container" style={{ padding: 'var(--space-8) 0' }} id="farm-live">
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            fontWeight: 600,
          }}
        >
          <Sprout size={14} /> {t('Bizning fermamiz', 'Наша ферма')}
        </div>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 'var(--font-extrabold)',
            fontSize: 'clamp(1.4rem, 3.5vw, 2rem)',
            marginTop: 4,
          }}
        >
          {t('Teplitsa hozir', 'Теплица прямо сейчас')}
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)', maxWidth: '56ch' }}>
          {t(
            'Kamera teplitsadan: nima o‘sayotgani hozir shunday ko‘rinadi.',
            'Камера в теплице: так это выглядит в эту минуту, без отбора кадров.',
          )}
        </p>
      </div>

      <div
        style={{
          position: 'relative',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          background: 'var(--bg-tertiary)',
        }}
      >
        <img
          src={`/api/farm/frame?t=${stamp}`}
          alt={t('Teplitsa hozir', 'Теплица прямо сейчас')}
          onError={() => setAlive(false)}
          style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', display: 'block' }}
        />

        <span
          style={{
            position: 'absolute',
            top: 'var(--space-3)',
            left: 'var(--space-3)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: 'var(--brand-primary)',
          }}
        >
          <Radio size={12} /> {t('jonli', 'в эфире')}
        </span>
      </div>
    </section>
  );
}
