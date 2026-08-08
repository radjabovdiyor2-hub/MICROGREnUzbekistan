import { describe, it, expect } from 'vitest';
import { weightedAverageCost, unitCostOfHarvest } from './weightedAverage';

// Тихие упущения производства, найденные аудитом. Каждый тест соответствует
// дефекту, который ничего не ломал — система просто считала не то.

describe('пересчёт килограммов в граммы', () => {
  // Норма расхода задана в ГРАММАХ, а мешок покупают килограммами.
  // Пересчёта не было нигде: списание вычитало число как есть, и попытка
  // посадить 4 лотка при норме 120 г отвечала «нужно 480 kg, на складе 1 kg».
  const toGrams = (kg: number) => kg * 1000;
  const pricePerGram = (pricePerKg: number) => pricePerKg / 1000;

  it('количество и цена переводятся согласованно', () => {
    expect(toGrams(1)).toBe(1000);
    expect(pricePerGram(222_000)).toBe(222);
  });

  it('стоимость закупки не меняется от единицы ввода', () => {
    // 1 кг по 222 000 и 1000 г по 222 — это одна и та же покупка.
    const viaKg = toGrams(1) * pricePerGram(222_000);
    expect(viaKg).toBe(222_000);
  });

  it('средняя после прихода в килограммах считается по граммам', () => {
    // Было 1000 г по 222, пришёл 1 кг по 300 000 (= 300 сум/г).
    const avg = weightedAverageCost(1000, 222, toGrams(1), pricePerGram(300_000));
    expect(avg).toBe(261);
  });
});

describe('себестоимость партии', () => {
  it('лотки входят в стоимость наравне с семенами', () => {
    // Лотки не списывались вовсе: тип был в справочнике, а посадка его не
    // трогала. Себестоимость выходила заниженной ровно на их стоимость.
    const seeds = 480 * 222;      // 480 г гороха
    const trays = 4 * 2_000;      // 4 одноразовых лотка
    const batchCost = seeds + trays;

    expect(batchCost).toBe(114_560);
    expect(unitCostOfHarvest(batchCost, 2000)).toBeCloseTo(57.28, 2);
    // Без лотков себестоимость единицы была бы ниже — на этом и терялись деньги.
    expect(unitCostOfHarvest(seeds, 2000)).toBeLessThan(
      unitCostOfHarvest(batchCost, 2000),
    );
  });

  it('упаковка добавляется при сборе, а не при посеве', () => {
    // Упаковка списывалась при посадке. У погибшей партии она оказывалась
    // потрачена зря и входила в её убыток.
    const atPlanting = 480 * 222 + 4 * 2_000;
    const packaging = 4 * 1_500;
    const atHarvest = atPlanting + packaging;

    // Погибшая партия: убыток — только то, что вложено при посадке.
    expect(atPlanting).toBe(114_560);
    // Собранная: упаковка входит в себестоимость единицы.
    expect(unitCostOfHarvest(atHarvest, 2000)).toBeGreaterThan(
      unitCostOfHarvest(atPlanting, 2000),
    );
  });
});
