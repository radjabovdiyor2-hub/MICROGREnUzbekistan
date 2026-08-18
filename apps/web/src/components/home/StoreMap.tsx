'use client';

import { useEffect, useRef } from 'react';
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

  useEffect(() => {
    const node = container.current;
    if (!node || map.current) return;

    const instance = new MapLibreMap({
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
    map.current = instance;

    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    new Marker({ color: '#10B981' })
      .setLngLat([longitude, latitude])
      .setPopup(undefined)
      .addTo(instance);

    return () => {
      instance.remove();
      map.current = null;
    };
  }, [latitude, longitude]);

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
