'use client';

import { useRef, useState } from 'react';
import { Camera, LogIn, LogOut } from 'lucide-react';

import { newClientRef } from '@/lib/tracking/stayQueue';

import { useStayQueue } from './useStayQueue';

// ══════════════════════════════════════════════════════════════════════
// «Я на точке» → фото → «Уехал».
//
// Три касания, которые превращают трек в отчёт: без отметки приезда
// длительность визита неоткуда взять, а без фото визит не подтверждён
// ничем, кроме координат.
//
// ВСЁ ИДЁТ ЧЕРЕЗ ОЧЕРЕДЬ, даже при живой связи. В подвале ресторана связи
// нет ровно тогда, когда человек стоит у точки, — то есть именно в тот
// момент, ради которого всё это и делается. Стоянку связывает `clientRef`,
// выданный телефоном: `id` из базы в этот момент взять неоткуда.
//
// ФОТО ОБЯЗАТЕЛЬНО, НО «УЕХАЛ» НЕ ЗАБЛОКИРОВАНА НАГЛУХО. Человек стоит на
// улице и хочет ехать дальше; запретить ему закрыть стоянку значит
// получить не фото, а брошенную открытую стоянку и злого продавца.
// Поэтому без кадра кнопка предупреждает и требует второго нажатия —
// «уехал без фото» остаётся видимым состоянием, а не тихой нормой.
// ══════════════════════════════════════════════════════════════════════

const text = {
  arrive: { ru: 'Я на точке', uz: 'Men nuqtadaman' },
  leave: { ru: 'Уехал', uz: 'Ketdim' },
  photo: { ru: 'Фото', uz: 'Surat' },
  noPhoto: { ru: 'Без фото? Нажмите ещё раз', uz: 'Suratsizmi? Yana bosing' },
  sending: { ru: 'Записываю…', uz: 'Yozilmoqda…' },
  failed: { ru: 'Не получилось — попробуйте ещё раз', uz: 'Boʻlmadi — qayta urining' },
  waiting: { ru: 'ждут связи', uz: 'aloqa kutmoqda' },
};

export function StayButtons({ customerId, lang }: { customerId: number; lang: 'ru' | 'uz' }) {
  const t = (key: keyof typeof text) => text[key][lang];
  const fileInput = useRef<HTMLInputElement>(null);
  const queue = useStayQueue();

  const [clientRef, setClientRef] = useState<string | null>(null);
  const [photos, setPhotos] = useState(0);
  const [busy, setBusy] = useState(false);
  const [warned, setWarned] = useState(false);
  const [error, setError] = useState('');

  const run = async (work: () => Promise<boolean>) => {
    setBusy(true);
    setError('');
    try {
      if (!(await work())) setError(t('failed'));
    } catch {
      setError(t('failed'));
    } finally {
      setBusy(false);
    }
  };

  const arrive = () =>
    run(async () => {
      const ref = newClientRef();
      const ok = await queue.remember({ kind: 'arrive', clientRef: ref, at: Date.now(), customerId });
      if (ok) setClientRef(ref);
      return ok;
    });

  const attach = (file: File) =>
    run(async () => {
      if (!clientRef) return false;
      const ok = await queue.remember({
        kind: 'photo',
        clientRef,
        at: Date.now(),
        customerId,
        blob: file,
      });
      if (ok) {
        setPhotos((n) => n + 1);
        setWarned(false);
      }
      return ok;
    });

  const leave = () => {
    // Первое нажатие без фото только предупреждает: см. заголовок файла.
    if (photos === 0 && !warned) {
      setWarned(true);
      return;
    }
    void run(async () => {
      if (!clientRef) return false;
      const ok = await queue.remember({ kind: 'leave', clientRef, at: Date.now(), customerId });
      if (ok) {
        setClientRef(null);
        setPhotos(0);
        setWarned(false);
      }
      return ok;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
        {clientRef === null ? (
          <button onClick={arrive} disabled={busy} className="btn btn-secondary btn-sm" style={{ display: 'flex', gap: 4, alignItems: 'center', minHeight: 44 }}>
            <LogIn size={14} /> {busy ? t('sending') : t('arrive')}
          </button>
        ) : (
          <>
            <button
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', gap: 4, alignItems: 'center', minHeight: 44 }}
            >
              <Camera size={14} /> {t('photo')}{photos > 0 ? ` · ${photos}` : ''}
            </button>
            <button
              onClick={leave}
              disabled={busy}
              className={warned ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
              style={{ display: 'flex', gap: 4, alignItems: 'center', minHeight: 44 }}
            >
              <LogOut size={14} /> {warned ? t('noPhoto') : t('leave')}
            </button>
          </>
        )}

        {/* Сколько записей ждёт связи. Молчать об этом нельзя: человек
            должен знать, что отметка сохранена, а не потеряна. */}
        {queue.pending > 0 && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {queue.pending} {t('waiting')}
          </span>
        )}
      </div>

      {error && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--error)' }}>{error}</span>}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        // `capture` открывает камеру сразу: витрину снимают на месте, а не
        // выбирают из галереи вчерашний кадр.
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void attach(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
