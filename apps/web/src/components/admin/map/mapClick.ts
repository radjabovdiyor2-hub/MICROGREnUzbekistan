import type { GeoJSONSource, MapGeoJSONFeature, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';

import {
  LAYER_CLUSTERS,
  LAYER_HOVER,
  LAYER_POINTS,
  LAYER_PROSPECTS,
  SOURCE_ID,
} from './mapLayers';
import {
  hitBox,
  hitRadius,
  isCluster,
  pickHit,
  stackedHits,
  type HitCandidate,
} from './mapHit';
import type { MapLatest } from './mapEvents';

// ══════════════════════════════════════════════════════════════════════
// Что человек имел в виду, ткнув в карту, — и что с этим делать.
//
// Разбор попавшего в рамку — в mapHit.ts, он чистый и проверяется тестом.
// Здесь то, что без карты не живёт: перевод фич в экранные координаты,
// раскрытие кластера и подсветка наведением.
// ══════════════════════════════════════════════════════════════════════

/** Слои, по которым вообще можно попасть. Порядок здесь не важен: очередь
 *  решает `pickHit` по расстоянию, а не порядок опроса. */
const HIT_LAYERS = [LAYER_POINTS, LAYER_PROSPECTS, LAYER_CLUSTERS];

/** Указатель грубый (палец), а не точный (мышь). */
function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}

/** Фича → кандидат в экранных координатах. Точки, у которых нет id, отбрасываем. */
function toCandidate(
  instance: MapLibreMap,
  feature: MapGeoJSONFeature,
): HitCandidate | null {
  if (feature.geometry.type !== 'Point') return null;
  const clusterId = feature.properties?.cluster_id;
  const id = typeof feature.id === 'number' ? feature.id : Number(clusterId);
  if (!Number.isFinite(id)) return null;

  const [lng, lat] = feature.geometry.coordinates as [number, number];
  const at = instance.project([lng, lat]);
  return {
    id,
    layer: feature.layer.id,
    at: { x: at.x, y: at.y },
    ...(clusterId === undefined ? {} : { clusterId: Number(clusterId) }),
  };
}

/**
 * Всё, что попало в рамку вокруг касания.
 *
 * Рамка, а не точка: см. mapHit.ts. Слои спрашиваем только те, что уже
 * добавлены, — после смены стиля MapLibre выбрасывает наши, и запрос по
 * несуществующему слою бросает исключение прямо из обработчика.
 */
export function candidatesAt(instance: MapLibreMap, e: MapMouseEvent): HitCandidate[] {
  const layers = HIT_LAYERS.filter((id) => instance.getLayer(id));
  if (layers.length === 0) return [];

  const box = hitBox(e.point, hitRadius(isCoarsePointer()));
  return instance
    .queryRenderedFeatures(box, { layers })
    .map((feature) => toCandidate(instance, feature))
    .filter((c): c is HitCandidate => c !== null);
}

/**
 * Один обработчик на все нажатия по карте.
 *
 * Раньше их было три — по слою точек, по слою кластеров и по карте, — и
 * порядок между ними определяла MapLibre, а не мы. Отсюда и то, что клик
 * мимо всего НЕ снимал выбор: обработчик карты умел только ставить пин.
 *
 * Порядок разбора — от самого узкого намерения к самому широкому:
 * простановка пина → стопка точек → кластер → точка → пустое место.
 */
/**
 * Подсветка точки под курсором — фильтром слоя, а не состоянием React.
 *
 * `mousemove` приходит десятками раз в секунду. Подними это в setState —
 * и каждое движение мыши перерисовывало бы панель, легенду и лоток
 * заодно с картой. Фильтр же меняется внутри MapLibre и React не будит.
 */
export function setHover(instance: MapLibreMap, id: number | null): void {
  if (!instance.getLayer(LAYER_HOVER)) return;
  instance.setFilter(LAYER_HOVER, ['==', ['id'], id ?? -1]);
}

export async function handleClick(
  instance: MapLibreMap,
  latest: { current: MapLatest },
  e: MapMouseEvent,
): Promise<void> {
  const now = latest.current;
  const candidates = candidatesAt(instance, e);

  // Режим простановки пина: клик по пустому месту — новая координата.
  // Попадание в существующую точку сюда не считается: там человек,
  // скорее всего, промахнулся мимо пустоты, а не решил переставить пин.
  if (now.placingId !== null) {
    if (candidates.length === 0) now.onPlace(e.lngLat);
    return;
  }

  const stack = stackedHits(candidates, e.point);
  if (stack.length >= 2 && now.onPickStack) {
    now.onPickStack(stack.map((hit) => hit.id));
    return;
  }

  const hit = pickHit(candidates, e.point);

  if (hit === null) {
    // Клик мимо всего снимает выбор. Панель точки оставалась открытой,
    // пока не нажмёшь крестик, — на телефоне она при этом закрывает
    // нижнюю треть карты, по которой человек и пытался ткнуть.
    now.onPickPoint(null);
    return;
  }

  if (isCluster(hit)) {
    const source = instance.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    const zoom = await source.getClusterExpansionZoom(hit.clusterId as number);
    instance.easeTo({ center: instance.unproject([hit.at.x, hit.at.y]), zoom });
    return;
  }

  now.onPickPoint(hit.id);
}
