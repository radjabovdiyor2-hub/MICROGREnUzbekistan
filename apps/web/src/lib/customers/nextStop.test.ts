import { describe, expect, it } from 'vitest';

import {
  NEARBY_MAX_KM, rankNextStops, readNextAnswer, type NextCandidate,
} from './nextStop';

// ══════════════════════════════════════════════════════════════════════
// «Куда дальше»: что именно предлагается человеку за рулём.
//
// Ошибка здесь тихая вдвойне: список выглядит разумным всегда. Поэтому
// проверяется не «работает», а те три решения, которые легко потерять при
// следующей правке — приоритет назначенного, порядок владельца при равном
// расстоянии и молчание соседей, пока работа не закрыта.
// ══════════════════════════════════════════════════════════════════════

/** Ферма в Самарканде — точка отсчёта во всех сценариях. */
const HERE = { latitude: 39.654, longitude: 66.9597 };

/** Смещение на восток в километрах: на этой широте градус ≈ 85.7 км. */
const east = (km: number) => HERE.longitude + km / 85.7;

function candidate(over: Partial<NextCandidate> = {}): NextCandidate {
  return {
    id: 1,
    name: 'Плов Центр',
    latitude: HERE.latitude,
    longitude: east(1),
    state: 'healthy',
    overdueRatio: null,
    lastVisitDays: null,
    kind: 'nearby',
    orderIndex: null,
    ...over,
  };
}

describe('rankNextStops — приоритет назначенного', () => {
  it('точка объезда в 3 км идёт выше соседа в 200 м', () => {
    // ВОТ ГЛАВНОЕ РЕШЕНИЕ. Склей корзины одним весом — и человек поедет
    // туда, куда его послала система, а не туда, куда послал владелец.
    const list = rankNextStops(
      [
        candidate({ id: 2, name: 'Сосед', kind: 'nearby', longitude: east(0.2), state: 'at_risk' }),
        candidate({ id: 3, name: 'Назначено', kind: 'plan', orderIndex: 0, longitude: east(3) }),
      ],
      HERE,
    );

    expect(list[0].point.name).toBe('Назначено');
    // Соседа не показываем ВООБЩЕ, пока назначенное не закрыто.
    expect(list).toHaveLength(1);
  });

  it('адрес рейса и точка объезда стоят в одном списке — у совмещённого', () => {
    // У владельца человек бывает и продавцом, и водителем сразу. Роль не
    // спрашивается: обе работы идут вперемешку, ближайшая первой.
    const list = rankNextStops(
      [
        candidate({ id: 4, name: 'Объезд', kind: 'plan', orderIndex: 0, longitude: east(2) }),
        candidate({ id: 5, name: 'Рейс', kind: 'delivery', orderIndex: 4, longitude: east(1) }),
      ],
      HERE,
    );

    expect(list.map((s) => s.point.name)).toEqual(['Рейс', 'Объезд']);
    expect(list[0].reason).toBe('в рейсе, адрес №5');
  });

  it('при равном расстоянии сохраняется порядок владельца', () => {
    // Вход приходит по `orderIndex`, сортировка в JS устойчива. Потеряй
    // устойчивость — и порядок объезда начнёт меняться от запроса к запросу.
    const same = { longitude: east(1.5), kind: 'plan' as const };
    const list = rankNextStops(
      [
        candidate({ id: 6, name: 'Вторая', orderIndex: 1, ...same }),
        candidate({ id: 7, name: 'Третья', orderIndex: 2, ...same }),
      ],
      HERE,
    );
    expect(list.map((s) => s.point.name)).toEqual(['Вторая', 'Третья']);
  });
});

describe('rankNextStops — соседи', () => {
  it('появляются, только когда назначенного не осталось', () => {
    const list = rankNextStops(
      [candidate({ id: 8, name: 'Сосед', state: 'at_risk', longitude: east(0.5) })],
      HERE,
    );
    expect(list.map((s) => s.point.name)).toEqual(['Сосед']);
  });

  it('дальше двух километров — это уже не «рядом»', () => {
    const far = rankNextStops(
      [candidate({ id: 9, longitude: east(NEARBY_MAX_KM + 1), state: 'at_risk' })],
      HERE,
    );
    expect(far).toEqual([]);
  });

  it('к кому заезжали вчера — не предлагаем', () => {
    // Повторный заход через сутки читается как назойливость; правило уже
    // принято в плане на день и здесь не переизобретается.
    const list = rankNextStops(
      [candidate({ id: 10, state: 'at_risk', lastVisitDays: 1, longitude: east(0.3) })],
      HERE,
    );
    expect(list).toEqual([]);
  });

  it('срочный сосед обходит здорового при прочих равных', () => {
    const list = rankNextStops(
      [
        candidate({ id: 11, name: 'Здоровый', state: 'healthy', longitude: east(0.4) }),
        candidate({ id: 12, name: 'На грани', state: 'at_risk', longitude: east(0.4) }),
      ],
      HERE,
    );
    expect(list[0].point.name).toBe('На грани');
  });
});

describe('rankNextStops — границы', () => {
  it('без позиции подсказок нет вовсе', () => {
    // «Ближайший» без точки отсчёта — это просто список, выданный за совет.
    expect(rankNextStops([candidate({ kind: 'plan', orderIndex: 0 })], null)).toEqual([]);
  });

  it('точка без координат в подсказки не попадает', () => {
    const list = rankNextStops(
      [candidate({ id: 13, kind: 'plan', orderIndex: 0, latitude: Number.NaN })],
      HERE,
    );
    expect(list).toEqual([]);
  });

  it('у каждой подсказки есть причина и расстояние словами', () => {
    const list = rankNextStops([candidate({ kind: 'plan', orderIndex: 0 })], HERE);
    expect(list[0].reason).not.toBe('');
    expect(list[0].kmLabel).toMatch(/м|км/);
  });

  it('больше трёх не показываем', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      candidate({ id: 20 + i, kind: 'plan', orderIndex: i, longitude: east(i + 1) }),
    );
    expect(rankNextStops(many, HERE)).toHaveLength(3);
  });

  it('пустой вход — пустой ответ, а не выдумка', () => {
    expect(rankNextStops([], HERE)).toEqual([]);
  });
});

describe('readNextAnswer — форме ответа не доверяем', () => {
  it('двести с пустым телом не роняет экран', () => {
    // РОВНО НА ЭТОМ УПАЛ CI. Сценарии карты глушат все адреса пустым
    // объектом; панель шла в `next.map` по `undefined` и уносила с собой
    // соседние панели — а выглядело это поломкой карты.
    const answer = readNextAnswer({});
    expect(answer.next).toEqual([]);
    expect(answer.gate).toBeNull();
  });

  it('пустой ответ вообще — то же самое', () => {
    expect(readNextAnswer(null).next).toEqual([]);
    expect(readNextAnswer(undefined).next).toEqual([]);
  });

  it('чужое значение запрета не пролезает', () => {
    // Запрет решает, что человек прочитает вместо подсказок. Незнакомое
    // слово показало бы пустой экран без объяснения.
    expect(readNextAnswer({ gate: 'выдумка', next: [] }).gate).toBeNull();
  });

  it('запрет без причины получает пустую причину, а не undefined', () => {
    const answer = readNextAnswer({ gate: 'shift', next: [] });
    expect(answer.gate).toBe('shift');
    expect(answer.gateText).toBe('');
  });

  it('нормальный ответ проходит как есть', () => {
    const one = { point: { id: 1, name: 'Тест', latitude: 39.6, longitude: 66.9 } };
    const answer = readNextAnswer({ gate: null, gateText: null, next: [one] });
    expect(answer.next).toHaveLength(1);
  });
});
