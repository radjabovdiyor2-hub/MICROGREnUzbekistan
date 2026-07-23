import { describe, it, expect } from 'vitest';
import { buildTemplate, parseDishCsv, CSV_COLUMNS } from './dishCsv';

describe('magazine/dishCsv · шаблон', () => {
  it('шаблон сам себя разбирает', () => {
    const { dishes, issues } = parseDishCsv(buildTemplate('Нон-кабоб'));
    expect(dishes).toHaveLength(1);
    expect(dishes[0].nameRu).toBe('Лагман');
    expect(dishes[0].price).toBe(45000);
    expect(dishes[0].category).toBe('main');
    // описание в кавычках содержит запятую и не должно разъезжаться по колонкам
    expect(dishes[0].descriptionRu).toBe('Домашняя лапша, говядина, овощи');
    expect(issues).toEqual([]);
  });

  it('шаблон содержит все колонки', () => {
    for (const c of CSV_COLUMNS) expect(buildTemplate()).toContain(c);
  });
});

describe('magazine/dishCsv · грязные файлы от ресторанов', () => {
  const header = CSV_COLUMNS.join(',');

  it('переживает «;» вместо «,» — Excel в русской локали', () => {
    const csv = `${CSV_COLUMNS.join(';')}\r\nПлов;Osh;;;55000;main;;plov.jpg`;
    const { dishes } = parseDishCsv(csv);
    expect(dishes).toHaveLength(1);
    expect(dishes[0].price).toBe(55000);
  });

  it('читает цену с пробелами и словом «сум»', () => {
    const { dishes, issues } = parseDishCsv(`${header}\nСамса,,,,"145 000 сум",,,`);
    expect(dishes[0].price).toBe(145000);
    expect(issues).toEqual([]);
  });

  it('битая цена не роняет импорт, а становится предупреждением', () => {
    const { dishes, issues } = parseDishCsv(`${header}\nЧай,,,,бесплатно,,,`);
    expect(dishes).toHaveLength(1);
    expect(dishes[0].price).toBeNull();
    expect(issues.some((i) => i.message.includes('цену'))).toBe(true);
  });

  it('пропускает пустые строки и строки без названия, но продолжает файл', () => {
    const { dishes, issues } = parseDishCsv(`${header}\n\n,,,,50000,,,\nЛагман,,,,45000,main,,`);
    expect(dishes.map((d) => d.nameRu)).toEqual(['Лагман']);
    expect(issues.some((i) => i.message.includes('Пустое название'))).toBe(true);
  });

  it('отбрасывает дубли по названию без учёта регистра', () => {
    const { dishes, issues } = parseDishCsv(`${header}\nЛагман,,,,45000,main,,\nЛАГМАН,,,,50000,main,,`);
    expect(dishes).toHaveLength(1);
    expect(issues.some((i) => i.message.includes('Дубль'))).toBe(true);
  });

  it('неизвестная категория не блокирует блюдо', () => {
    const { dishes, issues } = parseDishCsv(`${header}\nЛагман,,,,45000,горячее,,`);
    expect(dishes[0].category).toBeNull();
    expect(issues.some((i) => i.message.includes('категория'))).toBe(true);
  });

  it('сообщает о недостающих колонках', () => {
    const { issues } = parseDishCsv('name_ru,price\nЛагман,45000');
    expect(issues.some((i) => i.message.includes('Нет колонок'))).toBe(true);
  });

  it('пустой файл не падает', () => {
    expect(parseDishCsv('').dishes).toEqual([]);
    expect(parseDishCsv('# только комментарий').issues.length).toBeGreaterThan(0);
  });
});
