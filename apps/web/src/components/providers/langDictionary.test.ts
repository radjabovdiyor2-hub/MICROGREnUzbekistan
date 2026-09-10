import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { translations } from './LangProvider';

// ══════════════════════════════════════════════════════════════════════
// Словарь интерфейса и обещания первого экрана.
//
// СЛУЧАЙ, РАДИ КОТОРОГО ЭТО НАПИСАНО. На главной висела пара:
//
//   uz: «Bugun ekilgan — ertaga stolingizda»  — посеяли сегодня, завтра на столе
//   ru: «Свежесть с грядки — уже сегодня»      — сегодня, а не завтра
//
// Два языка одного заголовка говорили РАЗНОЕ, и оба спорили с подписью
// под собой («срезаем в день заказа, 30–90 минут») и с полосой «7 дней»
// выше. Заметил это владелец, читающий по-узбекски. Ни сборка, ни линтер,
// ни один тест такого не видят: обе строки синтаксически безупречны.
//
// Смысл перевода машина не проверит. Но три механических признака расхождения
// проверить можно, и все три в проекте уже случались.
// ══════════════════════════════════════════════════════════════════════

const CYRILLIC = /[а-яёА-ЯЁ]/;

/**
 * Ключи, к которым правило «язык в своей ячейке» неприменимо, и почему.
 *
 * Список ЯВНЫЙ, а не выведенный догадкой: исключение, подобранное
 * автоматически, однажды прикроет настоящую ошибку. Каждая строка здесь
 * должна объясняться словами.
 */
const EXEMPT: Record<string, string> = {
  // Переключатель показывает название ДРУГОГО языка: узбеку — «Русский»,
  // русскому — «O'zbekcha». Инверсия здесь и есть правильное поведение.
  'lang.switch': 'подпись переключателя намеренно перевёрнута',
};

/** Название бренда одинаково на обоих языках — переводить нечего. */
function isBrand(uz: string, ru: string): boolean {
  return uz === ru;
}

describe('словарь интерфейса', () => {
  const keys = Object.keys(translations);

  it('словарь не пуст — иначе проверка проверяет пустоту', () => {
    expect(keys.length).toBeGreaterThan(50);
  });

  it.each(keys)('%s заполнен на обоих языках', (key) => {
    // Пустая ячейка возвращает сам ключ: посетитель видит «hero.title1».
    expect(translations[key].uz.trim().length).toBeGreaterThan(0);
    expect(translations[key].ru.trim().length).toBeGreaterThan(0);
  });

  it('в узбекской ячейке нет кириллицы', () => {
    // Русская строка, скопированная в узбекскую ячейку, работает и
    // выглядит правдоподобно — пока текст не прочитает узбекоязычный.
    const wrong = keys.filter(
      (k) => !(k in EXEMPT) && CYRILLIC.test(translations[k].uz),
    );
    expect(wrong, `кириллица в узбекском: ${wrong.join(', ')}`).toEqual([]);
  });

  it('в русской ячейке есть кириллица', () => {
    // Обратный случай: узбекская строка осталась в русской ячейке.
    // Исключаем ключи без букв вовсе — их в словаре быть может.
    const wrong = keys.filter(
      (k) =>
        !(k in EXEMPT) &&
        !isBrand(translations[k].uz, translations[k].ru) &&
        /\p{L}/u.test(translations[k].ru) &&
        !CYRILLIC.test(translations[k].ru),
    );
    expect(wrong, `в русском нет кириллицы: ${wrong.join(', ')}`).toEqual([]);
  });

  it('список исключений не разрастается молча', () => {
    // Исключение — это признание, что правило здесь не работает. Пять
    // таких, и правило перестаёт значить что-либо. Порог низкий намеренно.
    expect(Object.keys(EXEMPT).length).toBeLessThanOrEqual(3);
    for (const key of Object.keys(EXEMPT)) {
      expect(keys, `исключение ${key} осталось от удалённого ключа`).toContain(key);
    }
  });

  it('апостроф в узбекском везде одинаковый', () => {
    // Соседние строки писались через `'` и через обратную кавычку: один
    // и тот же текст в двух написаниях, и поиск по нему не находит.
    const wrong = keys.filter((k) => translations[k].uz.includes('`'));
    expect(wrong, `обратная кавычка вместо апострофа: ${wrong.join(', ')}`).toEqual([]);
  });
});

describe('обещание первого экрана', () => {
  const home = join(process.cwd(), 'src', 'components', 'home');
  const read = (name: string) => readFileSync(join(home, name), 'utf8');

  it('обещаем СРЕЗКУ, а не посев', () => {
    // От посева до среза неделя. Обещать «посеяли сегодня — завтра у вас»
    // нельзя ни на одном языке: зелень столько не растёт.
    const cta = read('GrowFieldCTA.tsx');
    const promise = cta.split('\n').filter((l) => l.includes("{t(") || l.includes("kesilgan"));
    expect(promise.join(' ')).toContain('kesilgan');
    // «ekilgan» осталось только в комментарии, объясняющем правку.
    const code = cta
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
      .join('\n');
    expect(code).not.toMatch(/t\([^)]*ekilgan/);
  });

  it('полоса роста не выдаёт себя за срок доставки', () => {
    // «7-дневный цикл выращивания» читатель складывал с заказом и получал
    // «ждать неделю» — рядом с обещанием 30–90 минут.
    const timeline = read('GrowingTimeline.tsx');
    expect(timeline).toContain('GROW_TO_ORDER_DAYS');
    // Своей цифры быть не должно: копия уже разошлась бы с константой.
    expect(timeline).not.toMatch(/'7 kunlik/);
  });
});
