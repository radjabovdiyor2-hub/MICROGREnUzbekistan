// ════════════════════════════════════════════════════════════
// Рубрики журнала — словарь, а не таблица.
//
// ПОЧЕМУ В КОДЕ. Рубрика участвует в адресе (/magazine/health), в
// заголовках страниц и в разметке для поиска. Заводить её через админку
// значит разрешить опечатку в URL и потерю страницы вместе с ней; список
// меняется раз в год, а не раз в неделю.
//
// `recipes` — особая: её содержимое приходит из модели `Recipe`, у которой
// свои шаги, таймеры и сбор набора в корзину. В журнале она показывается
// наравне с остальными, но материалы туда не пишутся.
// ════════════════════════════════════════════════════════════

export type RubricId = 'health' | 'restaurants' | 'recipes' | 'home' | 'offers' | 'farm';

export interface Rubric {
  id: RubricId;
  ru: string;
  uz: string;
  /** Одна строка под заголовком рубрики: о чём здесь пишут. */
  taglineRu: string;
  taglineUz: string;
  emoji: string;
}

export const RUBRICS: Rubric[] = [
  {
    id: 'health',
    ru: 'Здоровье',
    uz: 'Salomatlik',
    taglineRu: 'Что и в каком порядке есть, чтобы день шёл ровно',
    taglineUz: "Kunni tekis o'tkazish uchun nimani va qanday tartibda yeyish kerak",
    emoji: '🌿',
  },
  {
    id: 'restaurants',
    ru: 'Рестораны',
    uz: 'Restoranlar',
    taglineRu: 'Кухни Самарканда и Ташкента, шефы и их подача',
    taglineUz: 'Samarqand va Toshkent oshxonalari, oshpazlar va ularning uslubi',
    emoji: '🍽',
  },
  {
    id: 'recipes',
    ru: 'Рецепты',
    uz: 'Retseptlar',
    taglineRu: 'Простые блюда с микрозеленью: шаги, таймеры, набор в корзину',
    taglineUz: "Mikroko'kat bilan oddiy taomlar: bosqichlar, taymerlar, savat",
    emoji: '🥗',
  },
  {
    id: 'home',
    ru: 'Советы хозяйке',
    uz: 'Bekaga maslahat',
    taglineRu: 'Как хранить, резать и подавать зелень, чтобы не выбрасывать',
    taglineUz: "Ko'katni qanday saqlash, to'g'rash va tortish kerak",
    emoji: '🏠',
  },
  {
    id: 'offers',
    ru: 'Скидки и наборы',
    uz: 'Chegirmalar va setlar',
    taglineRu: 'Что сейчас дешевле и какой набор к салату собрать',
    taglineUz: "Hozir nima arzon va salatga qanday set yig'ish mumkin",
    emoji: '🏷',
  },
  {
    id: 'farm',
    ru: 'Ферма',
    uz: 'Ferma',
    taglineRu: 'Как растёт то, что через сутки окажется на тарелке',
    taglineUz: "Bir kundan keyin likobga tushadigan narsa qanday o'sadi",
    emoji: '🌱',
  },
];

const BY_ID = new Map(RUBRICS.map((r) => [r.id, r]));

/** Рубрика по ключу из адреса. `null` — такой рубрики нет (страница 404). */
export function findRubric(id: string): Rubric | null {
  return BY_ID.get(id as RubricId) ?? null;
}

export function isRubricId(value: string): value is RubricId {
  return BY_ID.has(value as RubricId);
}

/** Рубрика рецептов наполняется моделью `Recipe`, а не материалами. */
export const RECIPE_RUBRIC: RubricId = 'recipes';
