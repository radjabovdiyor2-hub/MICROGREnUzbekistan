import { describe, it, expect } from 'vitest';
import { RUBRICS, RECIPE_RUBRIC, findRubric, isRubricId } from './rubrics';

// Рубрика попадает в АДРЕС страницы (/magazine/health) и в карту сайта.
// Опечатка или дубль здесь — это 404 у живой страницы и разъехавшийся
// sitemap, поэтому словарь проверяется, а не просто существует.
describe('рубрики журнала', () => {
  it('ключи уникальны', () => {
    const ids = RUBRICS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ключи безопасны для адреса: только строчная латиница', () => {
    for (const r of RUBRICS) {
      expect(r.id).toMatch(/^[a-z]+$/);
    }
  });

  it('у каждой рубрики есть название и подпись на обоих языках', () => {
    for (const r of RUBRICS) {
      expect(r.ru.trim()).not.toBe('');
      expect(r.uz.trim()).not.toBe('');
      expect(r.taglineRu.trim()).not.toBe('');
      expect(r.taglineUz.trim()).not.toBe('');
      expect(r.emoji.trim()).not.toBe('');
    }
  });

  it('findRubric находит известную и отказывает неизвестной', () => {
    expect(findRubric('health')?.ru).toBe('Здоровье');
    expect(findRubric('nonexistent')).toBeNull();
    // Пустая строка приходит из адреса вида /magazine//slug
    expect(findRubric('')).toBeNull();
  });

  it('isRubricId сужает тип по тому же словарю', () => {
    expect(isRubricId('offers')).toBe(true);
    expect(isRubricId('Offers')).toBe(false);
  });

  it('рубрика рецептов есть в словаре — на неё ведёт витрина', () => {
    expect(RUBRICS.some((r) => r.id === RECIPE_RUBRIC)).toBe(true);
  });
});
