import { describe, it, expect } from 'vitest';
import { detectDropouts, type CustomerHistory } from './rhythm';

const TODAY = new Date('2026-08-20T10:00:00');
const day = (d: string) => new Date(`2026-${d}T10:00:00`);

function history(dates: string[], p: Partial<CustomerHistory> = {}): CustomerHistory {
  return { customerId: 1, name: 'Плов-центр', orderDates: dates.map(day), ...p };
}

describe('detectDropouts', () => {
  // Берёт каждые 7 дней, молчит 21 — это выпадение, а не пауза.
  it('находит выпавшего из собственного ритма', () => {
    const r = detectDropouts([history(['07-10', '07-17', '07-24', '07-30'])], TODAY);

    expect(r).toHaveLength(1);
    expect(r[0].typicalDays).toBe(7);
    expect(r[0].silentDays).toBe(21);
  });

  it('молчит про того, кто в ритме', () => {
    const r = detectDropouts([history(['08-01', '08-08', '08-15'])], TODAY);
    expect(r).toEqual([]);
  });

  // Мерка у каждого своя: месячный клиент, не заказавший две недели,
  // ничего не нарушил.
  it('не считает выпавшим редкого клиента с его же интервалом', () => {
    const r = detectDropouts([history(['05-01', '06-01', '07-05', '08-05'])], TODAY);
    expect(r).toEqual([]);
  });

  // По двум заказам «ритм» — это один промежуток, то есть совпадение.
  it('молчит, когда заказов меньше трёх', () => {
    const r = detectDropouts([history(['06-01', '06-08'])], TODAY);
    expect(r).toEqual([]);
  });

  // Один отпуск не должен сдвигать мерку так, чтобы настоящий пропуск
  // перестал выделяться, — ради этого медиана, а не среднее.
  it('устойчив к одиночному длинному перерыву', () => {
    const r = detectDropouts(
      [history(['05-01', '05-08', '07-01', '07-08', '07-15'])],
      TODAY,
    );

    expect(r).toHaveLength(1);
    // Медиана промежутков — 7 дней, среднее было бы около 19.
    expect(r[0].typicalDays).toBe(7);
  });

  it('не спотыкается о несколько заказов в один день', () => {
    const r = detectDropouts([history(['08-01', '08-01', '08-01'])], TODAY);
    expect(r).toEqual([]);
  });

  it('дольше всех молчащие идут первыми', () => {
    const r = detectDropouts(
      [
        history(['07-01', '07-08', '07-15'], { customerId: 1, name: 'Ближе' }),
        history(['06-01', '06-08', '06-15'], { customerId: 2, name: 'Дальше' }),
      ],
      TODAY,
    );

    expect(r.map((d) => d.name)).toEqual(['Дальше', 'Ближе']);
  });

  it('не падает на пустом списке', () => {
    expect(detectDropouts([], TODAY)).toEqual([]);
  });
});
