'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// ══════════════════════════════════════════════════════════════════════
// Карта магазина на главной.
//
// Раньше здесь стоял iframe на yandex.ru/map-widget, и он НЕ РАБОТАЛ:
// `frame-src` в CSP разрешает только 'self' и telegram.org, поэтому
// браузер молча блокировал врезку. Посетитель видел пустой прямоугольник.
//
// Своя карта на тех же тайлах, что и карта клиентов в админке, закрывает
// сразу две дыры: врезка перестаёт зависеть от чужого домена во frame-src,
// и на странице больше нет стороннего фрейма, который видит referrer.
//
// Грузится только через next/dynamic с ssr:false — maplibre-gl трогает
// window прямо на импорте.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  latitude: number;
  longitude: number;
  /** Подпись метки для скринридера и всплывающей подсказки. */
  title: string;
}

const ZOOM = 16;

function styleUrl(): string {
  const base = process.env.NEXT_PUBLIC_MAP_TILES_URL || 'https://tiles.openfreemap.org';
  return `${base.replace(/\/$/, '')}/styles/positron`;
}

export default function StoreMap({ latitude, longitude, title }: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = container.current;
    if (!node || map.current) return;

    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container: node,
        style: styleUrl(),
        center: [longitude, latitude],
        zoom: ZOOM,
        attributionControl: { compact: true },
        // Витрина — не рабочий инструмент: карта не должна перехватывать
        // прокрутку страницы, когда посетитель просто листает мимо.
        scrollZoom: false,
        cooperativeGestures: true,
      });
    } catch (error) {
      // Конструктор бросает СИНХРОННО, когда WebGL недоступен: старое
      // железо, выключенное аппаратное ускорение, корпоративная политика.
      // Без перехвата исключение вылетает из эффекта и роняет всю секцию
      // на публичной главной — вместо карты посетитель теряет и адрес, и
      // кнопки маршрута. Показываем подложку, ссылки ниже остаются живыми.
      console.error('[store-map] карта не поднялась:', error);
      // Отдельным тиком, а не прямо здесь: setState в теле эффекта даёт
      // каскад перерисовок. Отрисовать подложку на кадр позже — ровно то,
      // что нужно, кадр этот всё равно пустой.
      queueMicrotask(() => setFailed(true));
      return;
    }
    map.current = instance;

    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    // Тайлы могли не приехать уже после старта — тот же исход для читателя.
    instance.on('error', () => setFailed(true));

    new Marker({ color: 'var(--brand-primary)' })
      .setLngLat([longitude, latitude])
      .addTo(instance);

    return () => {
      instance.remove();
      map.current = null;
    };
  }, [latitude, longitude]);

  if (failed) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          minHeight: 240,
          display: 'grid',
          placeItems: 'center',
          gap: 'var(--space-2)',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-muted)',
          textAlign: 'center',
          padding: 'var(--space-4)',
        }}
      >
        <MapPin size={28} aria-hidden />
        <span style={{ fontSize: 'var(--text-sm)' }}>{title}</span>
      </div>
    );
  }

  return (
    <div
      ref={container}
      role="img"
      aria-label={title}
      // Явная высота обязательна: без неё MapLibre схлопывается в ноль
      // пикселей и выглядит как несработавшая карта.
      style={{ width: '100%', height: '100%', minHeight: 240 }}
    />
  );
}
