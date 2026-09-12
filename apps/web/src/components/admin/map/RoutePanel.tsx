'use client';

import { AssignedPlanBanner } from './AssignedPlanBanner';
import { AssignRouteFromMap } from './AssignRouteFromMap';
import { BuildDayPlanButton } from './BuildDayPlanButton';
import { DayRoutePanel } from './DayRoutePanel';
import { NextStopPanel } from './NextStopPanel';
import { toPointView } from './mapFeature';
import type { PanelDeps } from './mapPanels';

// ══════════════════════════════════════════════════════════════════════
// Колонка объезда: что мне назначено, куда дальше, и сам список точек.
//
// ВЫНЕСЕНА ИЗ `mapPanels`, потому что тот упёрся в 200 строк. Порядок
// панелей здесь — не вкусовщина, а последовательность рабочего дня:
//
//   1. НАЗНАЧЕННОЕ ВЛАДЕЛЬЦЕМ — первым и до кнопки автоплана: иначе
//      продавец соберёт себе свой объезд и не узнает, что ему выдали
//      задание. Принимается кнопкой, а не подставляется молча.
//   2. КУДА ДАЛЬШЕ — следующий шаг внутри этого задания.
//   3. Собрать план — запасной путь, когда задания нет вовсе.
//   4. Сам список точек с порядком и навигацией.
// ══════════════════════════════════════════════════════════════════════

export function RoutePanel({ lang, m, route, isOwner = false }: PanelDeps & { isOwner?: boolean }) {
  return (
    <>
      <AssignedPlanBanner lang={lang} stops={route.stops} onAccept={route.setAll} />

      {/* Подсказка — ПОСЛЕ задания и ДО автоплана: она отвечает на «куда
          сейчас» внутри уже назначенной работы, а не заменяет её.

          ТОЛЬКО ТОМУ, КТО В ПОЛЕ. Владельцу она не нужна и вредна: он на
          карте смотрит на чужую работу, а дверь «мой день» его не знает —
          сотрудника с таким именем нет, и запрос уходил в отказ на каждое
          открытие карты. */}
      {!isOwner && (
      <NextStopPanel
        lang={lang}
        onPick={(stop) =>
          m.focusPoint({ id: stop.id, longitude: stop.longitude, latitude: stop.latitude })
        }
        onAdd={route.add}
      />
      )}

      {/* План собирается по ТЕМ ЖЕ точкам, что видны на карте: если человек
          отфильтровал по типу или району, план обязан идти по его выбору, а
          не по всей базе за его спиной. */}
      <BuildDayPlanButton
        lang={lang}
        points={m.visible.features.map(toPointView)}
        hasStops={route.stops.length > 0}
        isOwner={isOwner}
        onPlan={route.setAll}
      />

      {/* Назначение — СРАЗУ ПОД списком точек и только владельцу: он набрал
          их глазами по карте, и уходить ради этого на другой экран, чтобы
          набрать тот же список поиском заново, — это способ ошибиться, а не
          второй способ работы. */}
      {isOwner && (
        <AssignRouteFromMap lang={lang} stops={route.stops} onAssigned={route.clear} />
      )}

      <DayRoutePanel
        lang={lang}
        stops={route.stops}
        from={route.from}
        onRemove={route.remove}
        onMove={route.move}
        onSort={route.sort}
        onClear={route.clear}
        onPick={(stop) =>
          m.focusPoint({ id: stop.id, longitude: stop.longitude, latitude: stop.latitude })
        }
      />
    </>
  );
}
