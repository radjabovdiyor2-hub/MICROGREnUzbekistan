import { describe, it, expect } from 'vitest';
import { PRACTICES, PRACTICE_BY_KEY } from './catalog';
import { RHYTHMS, PRACTICE_AREAS, isRhythm } from './practices';

// ══════════════════════════════════════════════════════════════════════
// Сторож каталога.
//
// Каталог собран из разбора канала полуавтоматически, и часть разделов там
// состояла из одного заголовка — «зачем» у семнадцати практик оказалось
// пустым. Строка без объяснения бесполезна: владелец видит требование без
// причины и через неделю его игнорирует.
//
// Ключи ещё и попадают в базу как ссылка на практику, поэтому дубль здесь
// означал бы, что две практики делят одни отметки и одну серию.
// ══════════════════════════════════════════════════════════════════════

describe('каталог практик', () => {
  it('у каждой практики есть объяснение', () => {
    const mute = PRACTICES.filter((p) => p.why.trim().length < 20);
    expect(mute.map((p) => p.key)).toEqual([]);
  });

  it('ключи уникальны — иначе две практики делят одну серию', () => {
    expect(PRACTICE_BY_KEY.size).toBe(PRACTICES.length);
  });

  it('ключи латиницей: они уезжают в базу и в адреса', () => {
    const bad = PRACTICES.filter((p) => !/^[a-z0-9-]+$/.test(p.key));
    expect(bad.map((p) => p.key)).toEqual([]);
  });

  it('ритм из известного списка', () => {
    const bad = PRACTICES.filter((p) => !isRhythm(p.rhythm));
    expect(bad.map((p) => p.key)).toEqual([]);
  });

  it('ключ начинается с области, по нему экран и раскладывает', () => {
    const bad = PRACTICES.filter((p) => !PRACTICE_AREAS.some((a) => p.key.startsWith(`${a}-`)));
    expect(bad.map((p) => p.key)).toEqual([]);
  });

  it('у каждой практики есть заголовок и источник', () => {
    const bad = PRACTICES.filter((p) => !p.title.trim() || p.videos.length === 0);
    expect(bad.map((p) => p.key)).toEqual([]);
  });

  it('каталог не пуст и покрывает все области', () => {
    expect(PRACTICES.length).toBeGreaterThan(200);
    for (const area of PRACTICE_AREAS) {
      expect(PRACTICES.some((p) => p.key.startsWith(`${area}-`))).toBe(true);
    }
  });

  it('ритуалов заметно меньше правил — иначе это список, который не выполняют', () => {
    // Осознанный расклад, а не случайность: превращать «невозвратные
    // затраты» в ежедневную галочку значит убить весь экран.
    const rituals = PRACTICES.filter((p) => p.rhythm !== 'principle').length;
    expect(rituals).toBeLessThan(PRACTICES.length / 2);
    expect(rituals).toBeGreaterThan(20);
  });

  it('каждый ритм из списка кем-то используется', () => {
    for (const r of RHYTHMS) {
      expect(PRACTICES.some((p) => p.rhythm === r)).toBe(true);
    }
  });
});
