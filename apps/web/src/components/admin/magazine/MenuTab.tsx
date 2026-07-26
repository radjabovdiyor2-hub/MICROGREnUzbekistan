'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminClient';
import { DISH_CATEGORY_LABELS, isDishCategory, formatPrice } from '@/lib/magazine/menu';
import type { ParsedDish, ParseIssue } from '@/lib/magazine/dishCsv';
import { captureLastFrame } from '@/lib/magazine/videoPoster';

/* ─────────────────────────────────────────────
   Меню ресторана: скачать шаблон → получить заполненный файл →
   превью → сохранить → прикрепить фото к блюдам.
   Превью до сохранения обязательно: файлы приходят от людей,
   и владелец должен увидеть, что именно приедет в журнал.
   ───────────────────────────────────────────── */

interface Dish {
  id: string;
  code: number;
  nameRu: string;
  nameUz: string | null;
  price: number | null;
  category: string | null;
  pairsWith: string | null;
  photo: string | null;
  videoUrl: string | null;
  videoPoster: string | null;
  isActive: boolean;
}

export function MenuTab() {
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [restaurantId, setRestaurantId] = useState('');
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [preview, setPreview] = useState<{ dishes: ParsedDish[]; issues: ParseIssue[] } | null>(null);
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      const list = await (await adminFetch('/api/admin/magazine/restaurants')).json().catch(() => []);
      setRestaurants(Array.isArray(list) ? list : []);
      if (Array.isArray(list) && list.length && !restaurantId) setRestaurantId(list[0].id);
    })();
    // список ресторанов загружается один раз
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDishes = useCallback(async (id: string) => {
    if (!id) return setDishes([]);
    const list = await (await adminFetch(`/api/admin/magazine/dishes?restaurantId=${id}`)).json();
    setDishes(Array.isArray(list) ? list : []);
  }, []);

  useEffect(() => { loadDishes(restaurantId); }, [restaurantId, loadDishes]);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result ?? '');
      setCsv(text);
      setMessage('');
      const res = await (await adminFetch('/api/admin/magazine/dishes', {
        method: 'POST',
        body: JSON.stringify({ restaurantId, csv: text, dryRun: true }),
      })).json();
      setPreview(res);
    };
    // Excel в русской локали часто сохраняет в windows-1251 — читаем как UTF-8,
    // а если результат нечитаемый, владелец увидит это прямо в превью.
    reader.readAsText(file, 'utf-8');
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await (await adminFetch('/api/admin/magazine/dishes', {
        method: 'POST',
        body: JSON.stringify({ restaurantId, csv }),
      })).json();
      setMessage(`Сохранено блюд: ${res.saved}`);
      setPreview(null);
      setCsv('');
      await loadDishes(restaurantId);
    } catch (e: any) {
      setMessage(`Ошибка: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const uploadPhoto = async (dishId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    const data = await res.json();
    if (!data.url) return setMessage(data.error ?? 'Не удалось загрузить фото');
    await adminFetch('/api/admin/magazine/dishes', {
      method: 'PATCH',
      body: JSON.stringify({ id: dishId, photo: data.url }),
    });
    await loadDishes(restaurantId);
  };

  // Видео блюда: ролик + постер уходят одной операцией. Постер снимаем здесь,
  // в браузере — на сервере нет ffmpeg, а гость до старта видит именно его.
  const uploadVideo = async (dishId: string, file: File) => {
    setBusy(true);
    setMessage('');
    try {
      let poster: Blob | null = null;
      try {
        poster = (await captureLastFrame(file)).blob;
      } catch (e) {
        // Без постера ролик всё равно рабочий — просто до старта будет пусто
        setMessage(`Постер снять не удалось (${e instanceof Error ? e.message : 'ошибка'}), заливаю без него`);
      }

      const send = async (f: File | Blob, name: string) => {
        const form = new FormData();
        form.append('file', f instanceof File ? f : new File([f], name, { type: f.type }));
        const res = await fetch('/api/upload', { method: 'POST', body: form });
        return res.json();
      };

      const videoRes = await send(file, file.name);
      if (!videoRes.url) return setMessage(videoRes.error ?? 'Не удалось загрузить видео');

      const patch: Record<string, string> = { videoUrl: videoRes.url };
      if (poster) {
        const posterRes = await send(poster, `poster-${Date.now()}.jpg`);
        if (posterRes.url) patch.videoPoster = posterRes.url;
      }

      await adminFetch('/api/admin/magazine/dishes', {
        method: 'PATCH',
        body: JSON.stringify({ id: dishId, ...patch }),
      });
      await loadDishes(restaurantId);
      if (poster) setMessage('Видео и постер загружены');
    } finally {
      setBusy(false);
    }
  };

  const removeVideo = async (dishId: string) => {
    await adminFetch('/api/admin/magazine/dishes', {
      method: 'PATCH',
      body: JSON.stringify({ id: dishId, videoUrl: null, videoPoster: null }),
    });
    await loadDishes(restaurantId);
  };

  const removeDish = async (id: string) => {
    await adminFetch(`/api/admin/magazine/dishes?id=${id}`, { method: 'DELETE' });
    await loadDishes(restaurantId);
  };

  // Скачивание защищённого файла: <a href> не пошлёт заголовок с паролем,
  // поэтому тянем через adminFetch и отдаём blob как загрузку.
  const download = async (url: string, filename: string) => {
    try {
      const res = await adminFetch(url);
      if (!res.ok) return setMessage(`Ошибка загрузки: ${res.status}`);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(href);
    } catch (e: any) {
      setMessage(`Ошибка загрузки: ${e?.message ?? e}`);
    }
  };

  const slug = restaurants.find((r) => r.id === restaurantId)?.slug ?? restaurantId;
  const qrBase = `/api/admin/magazine/dishes/qr?restaurantId=${restaurantId}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={restaurantId}
          onChange={(e) => { setRestaurantId(e.target.value); setPreview(null); setCsv(''); }}
          style={input}
        >
          {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        <button
          onClick={() => download(`/api/admin/magazine/dishes?restaurantId=${restaurantId}&template=1`, `menu-${slug}.csv`)}
          style={btn}
        >
          ⬇ Скачать шаблон для ресторана
        </button>

        <label style={{ ...btn, background: 'var(--brand-primary)', color: '#fff', cursor: 'pointer' }}>
          ⬆ Загрузить заполненный CSV
          <input
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }}
          />
        </label>
      </div>

      {/* Экспорт QR для внешней вёрстки журнала */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>QR для журнала:</span>
        <button onClick={() => download(`${qrBase}&menu=1&format=png`, `qr-${slug}-menu.png`)} style={btn}>QR ресторана PNG</button>
        <button onClick={() => download(`${qrBase}&menu=1&format=svg`, `qr-${slug}-menu.svg`)} style={btn}>SVG</button>
        <button onClick={() => download(`${qrBase}&sheet=1`, `qr-${slug}-sheet.svg`)} style={btn}>⬇ Лист всех QR блюд</button>
      </div>

      {message && <div style={{ color: 'var(--text-secondary)' }}>{message}</div>}

      {preview && (
        <div style={card}>
          <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-3)' }}>
            Превью импорта · блюд: {preview.dishes.length}
          </h3>

          {preview.issues.length > 0 && (
            <ul style={{ marginBottom: 'var(--space-3)', color: 'var(--warning)', fontSize: 'var(--text-sm)' }}>
              {preview.issues.map((i, idx) => (
                <li key={idx}>{i.row ? `Строка ${i.row}: ` : ''}{i.message}</li>
              ))}
            </ul>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                <th>Название</th><th>Uz</th><th>Цена</th><th>Категория</th><th>Фото-файл</th>
              </tr>
            </thead>
            <tbody>
              {preview.dishes.map((d, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td>{d.nameRu}</td>
                  <td>{d.nameUz ?? '—'}</td>
                  <td>{formatPrice(d.price) ?? '—'}</td>
                  <td>{d.category && isDishCategory(d.category) ? DISH_CATEGORY_LABELS[d.category].ru : '—'}</td>
                  <td>{d.photoFile ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            onClick={save}
            disabled={busy || preview.dishes.length === 0}
            style={{ ...btn, background: 'var(--brand-primary)', color: '#fff', marginTop: 'var(--space-4)' }}
          >
            {busy ? 'Сохраняем...' : 'Сохранить в меню'}
          </button>
        </div>
      )}

      <div style={card}>
        <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-3)' }}>Меню · {dishes.length} блюд</h3>
        {dishes.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>Пока пусто — загрузите заполненный шаблон.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {dishes.map((d) => (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                padding: 'var(--space-2)', borderBottom: '1px solid var(--border-color)',
              }}>
                <span style={{ width: 28, color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>#{d.code}</span>
                {d.photo
                  ? <img src={d.photo} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
                  : <div style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--bg-elevated)' }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{d.nameRu}</div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                    {formatPrice(d.price) ?? 'без цены'}
                    {d.pairsWith ? ` · с чем берут: ${d.pairsWith}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => download(`${qrBase}&code=${d.code}&format=png`, `qr-${slug}-${d.code}.png`)}
                  style={{ ...btn, fontSize: 'var(--text-sm)' }}
                  title="QR блюда для журнала"
                >QR PNG</button>
                <button
                  onClick={() => download(`${qrBase}&code=${d.code}&format=svg`, `qr-${slug}-${d.code}.svg`)}
                  style={{ ...btn, fontSize: 'var(--text-sm)' }}
                >SVG</button>
                <label style={{ ...btn, cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
                  {d.photo ? 'Заменить фото' : 'Добавить фото'}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(d.id, f); }}
                  />
                </label>
                <label
                  style={{
                    ...btn, cursor: busy ? 'wait' : 'pointer', fontSize: 'var(--text-sm)',
                    ...(d.videoUrl ? { borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' } : {}),
                  }}
                  title="Вертикальный ролик блюда, max 8 МБ"
                >
                  {d.videoUrl ? '▶ Заменить видео' : 'Добавить видео'}
                  <input
                    type="file"
                    accept="video/mp4,video/webm"
                    style={{ display: 'none' }}
                    disabled={busy}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVideo(d.id, f); e.target.value = ''; }}
                  />
                </label>
                {d.videoUrl && (
                  <button onClick={() => removeVideo(d.id)} style={{ ...btn, fontSize: 'var(--text-sm)' }} title="Убрать видео, фото останется">
                    Убрать видео
                  </button>
                )}
                <button onClick={() => removeDish(d.id)} style={{ ...btn, color: 'var(--error)' }}>Удалить</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  padding: 'var(--space-4)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-elevated)',
};

const btn: React.CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-color)',
  background: 'transparent',
  color: 'var(--text-primary)',
  fontWeight: 600,
  cursor: 'pointer',
};

const input: React.CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
};
