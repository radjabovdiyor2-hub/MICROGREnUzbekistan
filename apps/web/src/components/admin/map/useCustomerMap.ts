'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { clientErrorMessage } from '@/lib/safeError';
import { readSnapshot, saveSnapshot } from '@/lib/customers/mapSnapshot';
import type { SegmentState } from '@/lib/customers/segments';

import type { DeliveryCollection } from '@/lib/customers/deliveryRoutes';

import { DETAILED_BASE_KEY, useRememberedFlag } from './useMapPrefs';

import {
  EMPTY_COLLECTION,
  searchPoints,
  toPointView,
  type ColorizeMode,
  type MapCollection,
  type MapFeature,
} from './mapFeature';

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
  const [district, setDistrict] = useState<string | null>(null);
  // Тип заведения и аудитория. 'all' — не фильтровать; аудитория при этом
  // сбрасывается вместе со сменой типа: «женский» без «фитнеса» — это
  // вопрос, на который справочник почти всегда отвечает пустотой.
  // Типы заведений — НАБОР, а не одно значение: рестораны, кафе и чайханы
  // это один разговор с одним предложением, а смотреть их приходилось по
  // очереди, держа картину в голове.
  //
  // Пустой набор означает «все» — так же, как `states === null` у легенды.
  // Отдельного значения 'all' в наборе нет: оно превратилось бы в
  // шестнадцатый тип, который надо не забыть исключить в четырёх местах.
  const [companyTypes, setCompanyTypes] = useState<Set<string>>(new Set());

  /** Устойчивое представление набора: порядок не зависит от порядка нажатий. */
  const typesKey = [...companyTypes].sort().join(',');
  const [audience, setAudience] = useState('all');
  const [showDelivery, setShowDelivery] = useState(false);
  // Тепло и подробная подложка — вид карты, а не фильтр: данные они не
  // перезапрашивают, поэтому и в ключ запроса не входят.
  const [showHeat, setShowHeat] = useState(false);
  // Подложка запоминается: её выбирают под свою местность и под своё
  // зрение, а не заново каждое утро.
  const [detailedBase, setDetailedBase] = useRememberedFlag(DETAILED_BASE_KEY, false);
  // Несколько точек под пальцем: выбирает человек. Пустой массив — стопки
  // нет; см. mapHit.stackedHits.
  const [stackIds, setStackIds] = useState<number[]>([]);
  // Режим «подряд»: после каждого пина сам взводит следующего клиента.
  const [chaining, setChaining] = useState(false);
  // Поиск по названию и подлёт к найденной точке.
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState<{ lng: number; lat: number; at: number } | null>(null);

  // Маршруты живут своей жизнью: клиенты меняются неделями, объезд — в
  // течение дня. Отдельный запрос с частым обновлением вместо одного
  // общего, который иначе пришлось бы дёргать целиком каждую минуту.
  const deliveryQuery = useQuery<DeliveryCollection, Error>({
    queryKey: ['admin-customers-map-delivery'],
    queryFn: async () => {
      const res = await fetch('/api/admin/customers/map/delivery');
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Не удалось загрузить маршруты');
      return body;
    },
    enabled: showDelivery,
    refetchInterval: showDelivery ? 60_000 : false,
  });

  // Ключ снимка — те же фильтры, что и у запроса. Показать под фильтром
  // «тойхоны Ургута» точки, снятые по всей области, значит соврать.
  const snapshotKey = [
    typeFilter,
    cityFilter,
    showProspects ? 'p' : '',
    district ?? '',
    // Набор в ключе — строкой и в устойчивом порядке: иначе один и тот же
    // выбор давал бы разные ключи и снимок карты не находился бы.
    typesKey,
    audience,
  ].join('|');

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery<MapCollection, Error>({
    queryKey: [
      'admin-customers-map',
      typeFilter,
      cityFilter,
      showProspects,
      district,
      typesKey,
      audience,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (cityFilter !== 'all') params.set('city', cityFilter);
      if (showProspects) params.set('prospects', '1');
      if (district) params.set('district', district);
      if (companyTypes.size > 0) params.set('companyType', [...companyTypes].join(','));
      if (audience !== 'all') params.set('audience', audience);
      const qs = params.toString();

      const res = await fetch(`/api/admin/customers/map${qs ? `?${qs}` : ''}`);
      const body = await res.json().catch(() => null);
      // Отказ сервера показываем как есть: «под фильтр попало 12 000
      // клиентов» — осмысленный ответ, и подменять его общей ошибкой
      // значит снова спрятать причину.
      if (!res.ok) throw new Error(body?.error || 'Не удалось загрузить карту');
      // Снимок на случай обрыва связи. Отказ хранилища не мешает карте:
      // человек открыл её, а не localStorage.
      saveSnapshot(body, snapshotKey);
      return body;
    },
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  });

  /**
   * Что показывать, когда связи нет.
   *
   * Раньше первый же обрыв давал пустой экран и красную плашку — карта
   * переставала работать ровно в тот момент, ради которого её открыли: в
   * подвале ресторана, в туманах области. Снимок читается ТОЛЬКО при
   * отказе запроса и только под теми же фильтрами.
   */
  const snapshot = useMemo(
    () => (error && !data ? readSnapshot(snapshotKey) : null),
    [error, data, snapshotKey],
  );

  const collection = data ?? snapshot?.collection ?? EMPTY_COLLECTION;

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

  // Очередь на расстановку — по деньгам убыв. Порядок задаётся ЗДЕСЬ, а не
  // в лотке: «следующий» в цепочке обязан совпадать с тем, что владелец
  // видит списком, иначе карта прыгает не туда, куда он смотрит.
  //
  // У продавца суммы закрыты, и сортировка по ним выродилась бы в порядок
  // выборки: разницы между «важным» и «случайным» клиентом он бы не увидел.
  // Запасной ключ — число заказов: тот же вопрос «кто для нас весомее»,
  // заданный на том, что ему видно.
  const queue = useMemo(
    () =>
      [...collection.unplaced].sort(
        (a, b) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0) || b.ordersCount - a.ordersCount,
      ),
    [collection.unplaced],
  );

  const matches = useMemo(
    () => searchPoints(collection.features, query),
    [collection, query],
  );

  const selected = useMemo(() => {
    const feature = collection.features.find((f) => f.id === selectedId);
    return feature ? toPointView(feature) : null;
  }, [collection, selectedId]);

  // Esc — лестница выхода, а не одна ступень.
  //
  // Раньше обработчик висел ТОЛЬКО в режиме простановки пина, и панель
  // выбранной точки закрывалась исключительно крестиком. Порядок здесь
  // от самого узкого к самому широкому; полный экран стоит следующей
  // ступенью и слушает Esc только когда всё это уже закрыто (см.
  // useMapFullscreen).
  useEffect(() => {
    const open = placingId !== null || stackIds.length > 0 || selectedId !== null;
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (placingId !== null) {
        // Esc выходит из режима целиком, а не только из текущего пина:
        // иначе цепочка молча продолжилась бы со следующего клиента.
        setPlacingId(null);
        setChaining(false);
        return;
      }
      if (stackIds.length > 0) {
        setStackIds([]);
        return;
      }
      setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placingId, stackIds, selectedId]);

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

      // Следующего берём из очереди ДО перезапроса: после него поставленный
      // клиент из неё исчезнет, и позиция потеряется.
      const at = queue.findIndex((c) => c.id === placingId);
      const next = chaining && at >= 0 ? queue[at + 1] : undefined;
      setPlacingId(next ? next.id : null);
      if (!next) setChaining(false);

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

  /**
   * Подлёт к точке: выделяем и просим карту переместиться.
   *
   * `at` в метке — не украшение: подлёт к ТОЙ ЖЕ точке второй раз обязан
   * сработать снова, а по одним координатам эффект не перезапустится.
   */
  const focusPoint = (point: { id: number; longitude: number; latitude: number }) => {
    setSelectedId(point.id);
    setFocus({ lng: point.longitude, lat: point.latitude, at: Date.now() });
  };

  return {
    collection,
    visible,
    selected,
    query,
    setQuery,
    matches,
    focus,
    focusPoint,
    isLoading,
    error,
    refetch,
    dataUpdatedAt,
    /** Не null — на экране снимок, а не свежие данные. */
    snapshotAt: snapshot?.at ?? null,

    mode,
    setMode,
    typeFilter,
    setTypeFilter,
    cityFilter,
    setCityFilter,
    states,
    setStates,
    toggleState,

    selectedId,
    setSelectedId,
    placingId,
    setPlacingId,
    savePin,
    queue,
    chaining,
    startChain: () => {
      const first = queue[0];
      if (!first) return;
      setChaining(true);
      setPlacingId(first.id);
    },
    stopChain: () => {
      setChaining(false);
      setPlacingId(null);
    },

    tilesFailed,
    setTilesFailed,
    saveError,
    showProspects,
    setShowProspects,
    district,
    setDistrict,
    companyTypes,
    /** Включить или выключить тип. Пустой набор = все. */
    toggleCompanyType: (value: string) => {
      setCompanyTypes((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      });
      // Смена типа снимает аудиторию: лента «женский / мужской» исчезает
      // вместе с фитнесом, а невидимый включённый фильтр — это карта,
      // которая необъяснимо пуста.
      setAudience('all');
    },
    /** «Все типы»: снять выбор целиком. */
    clearCompanyTypes: () => {
      setCompanyTypes(new Set());
      setAudience('all');
    },
    audience,
    setAudience,
    showDelivery,
    setShowDelivery,
    showHeat,
    setShowHeat,
    detailedBase,
    setDetailedBase,
    stackIds,
    /** Точки стопки в развёрнутом виде — для списка выбора. */
    stack: stackIds
      .map((id) => collection.features.find((f) => f.id === id))
      .filter((f): f is MapFeature => f !== undefined)
      .map(toPointView),
    /** Показать выбор из нескольких точек под пальцем. */
    setStackIds,
    /** Выбрать точку из стопки: список закрывается, панель открывается. */
    pickFromStack: (id: number) => {
      setStackIds([]);
      setSelectedId(id);
    },
    delivery: showDelivery ? (deliveryQuery.data ?? null) : null,
    deliveryError: deliveryQuery.error,
    routes: deliveryQuery.data?.routes ?? [],
  };
}
