'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { clientErrorMessage } from '@/lib/safeError';
import type { SegmentState } from '@/lib/customers/segments';

import { EMPTY_COLLECTION, toPointView, type ColorizeMode, type MapCollection } from './mapFeature';

// ══════════════════════════════════════════════════════════════════════
// Состояние карты клиентов: запрос, фильтры, выбор точки, ручной пин.
//
// «Живой» карту делает не вебсокет, а опрос раз в минуту: каждый заказ —
// с сайта, из бота, от менеджера — проходит через зеркало /ingest/order в
// crm_orders, поэтому минуты достаточно, чтобы точка перекрасилась сама.
// Глобальный ReactQueryProvider настроен на staleTime 60с и БЕЗ рефетча по
// фокусу, поэтому оба параметра задаются здесь заново.
// ══════════════════════════════════════════════════════════════════════

const REFRESH_MS = 60_000;

export function useCustomerMap() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ColorizeMode>('state');
  const [typeFilter, setTypeFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [states, setStates] = useState<Set<SegmentState> | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [placingId, setPlacingId] = useState<number | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showProspects, setShowProspects] = useState(false);

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery<MapCollection, Error>({
    queryKey: ['admin-customers-map', typeFilter, cityFilter, showProspects],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (cityFilter !== 'all') params.set('city', cityFilter);
      if (showProspects) params.set('prospects', '1');
      const qs = params.toString();

      const res = await fetch(`/api/admin/customers/map${qs ? `?${qs}` : ''}`);
      const body = await res.json().catch(() => null);
      // Отказ сервера показываем как есть: «под фильтр попало 12 000
      // клиентов» — осмысленный ответ, и подменять его общей ошибкой
      // значит снова спрятать причину.
      if (!res.ok) throw new Error(body?.error || 'Не удалось загрузить карту');
      return body;
    },
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  });

  const collection = data ?? EMPTY_COLLECTION;

  // Фильтр по состоянию применяем на клиенте: данные уже здесь, и гонять
  // запрос ради подсветки легенды незачем. Проспекты фильтру не подчиняются:
  // у них нет состояния отношений, и прятать их вместе с клиентами значило
  // бы терять карту белых пятен при первом же клике по легенде.
  const visible = useMemo<MapCollection>(() => {
    if (!states) return collection;
    return {
      ...collection,
      features: collection.features.filter(
        (f) => f.properties.k === 'restaurant' || states.has(f.properties.st),
      ),
    };
  }, [collection, states]);

  const selected = useMemo(() => {
    const feature = collection.features.find((f) => f.id === selectedId);
    return feature ? toPointView(feature) : null;
  }, [collection, selectedId]);

  // Esc выходит из режима простановки пина — иначе отменить его можно
  // только случайным кликом по карте, то есть поставив пин не туда.
  useEffect(() => {
    if (placingId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlacingId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placingId]);

  const savePin = async (lngLat: { lng: number; lat: number }) => {
    if (placingId === null) return;
    setSaveError(null);
    try {
      const res = await fetch('/api/admin/customers/map', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: placingId, latitude: lngLat.lat, longitude: lngLat.lng }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Не удалось сохранить пин');
      setPlacingId(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['admin-customer'] });
    } catch (err: unknown) {
      setSaveError(clientErrorMessage(err, 'Ошибка при сохранении пина'));
    }
  };

  /** Клик по строке легенды: включить/выключить состояние. Пусто = все. */
  const toggleState = (state: SegmentState) => {
    setStates((prev) => {
      if (!prev) return new Set([state]);
      const next = new Set(prev);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      return next.size === 0 ? null : next;
    });
  };

  return {
    collection,
    visible,
    selected,
    isLoading,
    error,
    refetch,
    dataUpdatedAt,

    mode,
    setMode,
    typeFilter,
    setTypeFilter,
    cityFilter,
    setCityFilter,
    states,
    toggleState,

    selectedId,
    setSelectedId,
    placingId,
    setPlacingId,
    savePin,

    tilesFailed,
    setTilesFailed,
    saveError,
    showProspects,
    setShowProspects,
  };
}
