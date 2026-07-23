// ════════════════════════════════════════════════════════════
// Шаблон меню для ресторанов и разбор заполненного файла.
//
// Формат — CSV в UTF-8 с BOM: открывается двойным кликом в Excel,
// не требует npm-зависимости и не ломается при пересылке в мессенджере.
// Файл приходит от людей, а не от системы, поэтому парсер обязан
// пережить лишние пробелы, пустые строки, точки с запятой вместо запятых
// и цены вида «145 000 сум».
// ════════════════════════════════════════════════════════════

import { DISH_CATEGORIES, isDishCategory, type DishCategory } from './menu';

export const CSV_COLUMNS = [
  'name_ru', 'name_uz', 'description_ru', 'description_uz',
  'price', 'category', 'pairs_with', 'photo_file',
] as const;

export interface ParsedDish {
  nameRu: string;
  nameUz: string | null;
  descriptionRu: string | null;
  descriptionUz: string | null;
  price: number | null;
  category: DishCategory | null;
  pairsWith: string | null;
  photoFile: string | null;
}

export interface ParseIssue {
  row: number;      // номер строки в файле, как его видит человек в Excel
  message: string;
}

export interface ParseResult {
  dishes: ParsedDish[];
  issues: ParseIssue[];
}

const BOM = '﻿';

// ── Шаблон ──

export function buildTemplate(restaurantName = 'Ресторан'): string {
  const rows = [
    `# Меню ресторана «${restaurantName}» для журнала FRESH WEEKLY`,
    '# Заполните строки ниже. Первая строка после заголовка — пример, её можно удалить.',
    `# category: ${DISH_CATEGORIES.join(' | ')}`,
    '# price — только число в сумах, без пробелов и слова «сум»',
    '# photo_file — имя файла фото, которое вы пришлёте отдельно (например: lagman.jpg)',
    '',
    CSV_COLUMNS.join(','),
    [
      'Лагман',
      'Lagʻmon',
      '"Домашняя лапша, говядина, овощи"',
      '"Uy lagʻmoni, mol goʻshti, sabzavotlar"',
      '45000',
      'main',
      'Зелёный чай',
      'lagman.jpg',
    ].join(','),
  ];
  return BOM + rows.join('\r\n') + '\r\n';
}

// ── Разбор ──

// Разбор одной строки с поддержкой кавычек: "Домашняя лапша, говядина" —
// это одно поле, а не два, иначе меню рассыпается на первой же запятой.
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out.map((f) => f.trim());
}

// Excel в русской локали сохраняет CSV с «;» — определяем разделитель
// по строке заголовка, иначе весь файл прочитается как одна колонка.
function detectDelimiter(headerLine: string): string {
  return headerLine.split(';').length > headerLine.split(',').length ? ';' : ',';
}

function parsePrice(raw: string): number | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const nullable = (v: string) => (v ? v : null);

export function parseDishCsv(text: string): ParseResult {
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/);
  const issues: ParseIssue[] = [];
  const dishes: ParsedDish[] = [];

  // Комментарии-инструкция и пустые строки в начале файла игнорируются
  const headerIdx = lines.findIndex((l) => !l.startsWith('#') && l.trim() !== '');
  if (headerIdx === -1) {
    return { dishes, issues: [{ row: 0, message: 'Файл пустой' }] };
  }

  const delimiter = detectDelimiter(lines[headerIdx]);
  const header = splitLine(lines[headerIdx], delimiter).map((h) => h.toLowerCase());
  const missing = CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) {
    issues.push({ row: headerIdx + 1, message: `Нет колонок: ${missing.join(', ')}` });
  }
  const col = (name: string) => header.indexOf(name);

  const seen = new Set<string>();

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const rowNo = i + 1;
    if (!line.trim() || line.startsWith('#')) continue;

    const cells = splitLine(line, delimiter);
    const get = (name: string) => {
      const idx = col(name);
      return idx === -1 ? '' : (cells[idx] ?? '');
    };

    const nameRu = get('name_ru');
    if (!nameRu) {
      issues.push({ row: rowNo, message: 'Пустое название (name_ru) — строка пропущена' });
      continue;
    }
    const key = nameRu.toLowerCase();
    if (seen.has(key)) {
      issues.push({ row: rowNo, message: `Дубль блюда «${nameRu}» — строка пропущена` });
      continue;
    }
    seen.add(key);

    const rawCategory = get('category').toLowerCase();
    let category: DishCategory | null = null;
    if (rawCategory) {
      if (isDishCategory(rawCategory)) category = rawCategory;
      else issues.push({ row: rowNo, message: `Неизвестная категория «${rawCategory}» — блюдо без категории` });
    }

    const rawPrice = get('price');
    const price = parsePrice(rawPrice);
    if (rawPrice && price === null) {
      issues.push({ row: rowNo, message: `Не удалось прочитать цену «${rawPrice}» — блюдо без цены` });
    }

    dishes.push({
      nameRu,
      nameUz: nullable(get('name_uz')),
      descriptionRu: nullable(get('description_ru')),
      descriptionUz: nullable(get('description_uz')),
      price,
      category,
      pairsWith: nullable(get('pairs_with')),
      photoFile: nullable(get('photo_file')),
    });
  }

  if (!dishes.length) issues.push({ row: 0, message: 'В файле не найдено ни одного блюда' });
  return { dishes, issues };
}
