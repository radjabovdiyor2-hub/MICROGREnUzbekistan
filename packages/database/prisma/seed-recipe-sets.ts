/**
 * Наборы из действующего ассортимента — двадцать штук.
 *
 * ЗАЧЕМ ЭТОТ СИД СУЩЕСТВУЕТ
 * Спецификация `doc/product-sets-spec.md` описывает тридцать два набора, но
 * купить их было нельзя: набор существовал в документе, а на сайте — только
 * отдельные товары.
 *
 * НАБОР — ТОВАР, А ЭТА СТРАНИЦА — ЕГО ОПИСАНИЕ. Двадцать наборов заведены
 * строками прайса (сторона 4) и живут обычными товарами со своей ценой; здесь
 * к ним добавляется то, чего карточка товара не вмещает: состав словами,
 * порядок подачи и что добавить дома.
 *
 * ССЫЛКА НА ТОВАР РОВНО ОДНА — САМ НАБОР. Кнопка «собрать набор» кладёт в
 * корзину его целиком: одна цена, одна строка в чеке. Оставь мы ссылки на
 * компоненты — на сайте появились бы два пути купить одно и то же по разной
 * цене, и продавец не смог бы объяснить разницу.
 *
 * ЧТО НАШЕ, А ЧТО ДОМАШНЕЕ. Компоненты перечислены текстом: они говорят, что
 * внутри. Мясо, сыр, яйцо, крупа, овощи и фрукты — тоже текстом, отдельной
 * подсказкой: мы их не продаём, и называть их своим товаром нельзя.
 *
 * ⚠️ РЕГИСТР ТЕКСТА ЗАДАН §6.2 doc/balans_concept.md. Разрешено: состав,
 * граммы, вкус, способ подачи. Утверждение о СВОЙСТВЕ заменяется
 * утверждением о СОСТАВЕ или о порядке подачи. Файл входит в проверяемый
 * контур — имя `seed-recipe-sets.ts` подобрано так, чтобы его ловил glob
 * `seed-recipe*.ts` в `scripts/check-claims.mjs`, а не пришлось вспоминать
 * про новый файл руками.
 *
 * ФОТО НЕОБЯЗАТЕЛЬНО. `heroImage` проставляется только если файл реально
 * лежит в `apps/web/public/catalog/`. Карточка без фото рисуется без
 * картинки (см. `RecipeCard`), а не битой ссылкой. Положили снимки —
 * запустите сид ещё раз, и они подхватятся.
 *
 * Идемпотентно: upsert по slug, шаги и ингредиенты пересоздаются.
 *
 * Запуск:  cd packages/database && npx tsx prisma/seed-recipe-sets.ts
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Где лежат снимки наборов. Тот же каталог, что и у карточек товаров. */
const PHOTO_DIR = join(__dirname, '..', '..', '..', 'apps', 'web', 'public', 'catalog');

/**
 * Слаг товара-набора выводится из имени его картинки — ровно так же, как это
 * делает `import-catalog.ts::slugOf`. Держим одно правило, а не две копии:
 * разойдутся они молча, и кнопка «в корзину» перестанет находить набор.
 */
const productSlugOf = (photo: string) => photo.replace(/\.webp$/i, '').replace(/_/g, '-');

interface Ingredient {
  nameRu: string;
  nameUz: string;
  amount: string;
  /** Слаг товара. Без него ингредиент — подсказка «добавьте своё». */
  productSlug?: string;
}

interface Step {
  textRu: string;
  textUz: string;
}

interface SetSeed {
  slug: string;
  titleRu: string;
  titleUz: string;
  descriptionRu: string;
  descriptionUz: string;
  /** Минуты на сборку и подачу, а не на готовку: набор не варят. */
  cookMinutes: number;
  servings: number;
  sortOrder: number;
  /** Имя файла снимка. Нет файла — карточка живёт без картинки. */
  photo: string;
  ingredients: Ingredient[];
  steps: Step[];
}

/** Шаг, общий для всех наборов: заправка идёт последней. */
const DRESS: Step = {
  textRu: 'Заправляйте перед самой подачей: в кислоте зелень оседает за час.',
  textUz: "Berishdan oldin ziravor qo'shing: sirkada ko'kat bir soatda cho'kadi.",
};

/** И ещё один: хранение. Срок набора равен минимуму из компонентов. */
const KEEP: Step = {
  textRu: 'Храните при 2–5 °C и не нагревайте выше 70 °C — выше зелень теряет вкус и витамин C.',
  textUz: "2–5 °C da saqlang va 70 °C dan yuqori qizdirmang — ko'kat ta'mini yo'qotadi.",
};

const SETS: SetSeed[] = [
  // ── BALANS ────────────────────────────────────────────────────────────
  {
    slug: 'set-tanishuv',
    titleRu: 'Набор «Знакомство»',
    titleUz: '«Tanishuv» to‘plami',
    descriptionRu:
      'Два полюса ассортимента рядом: мягкий микс без горечи и острый — с кинзой и редисом. '
      + 'Набор для того, кто ещё не знает, какой вкус ему подойдёт.',
    descriptionUz:
      "Assortimentning ikki qutbi yonma-yon: achchiqsiz yumshoq miks va kashnich bilan o'tkir miks. "
      + "Qaysi ta'm mos kelishini hali bilmaganlar uchun.",
    cookMinutes: 3, servings: 2, sortOrder: 101, photo: 'set_bl1_tanishuv.webp',
    ingredients: [
      { nameRu: 'BALANS Мягкий', nameUz: 'BALANS Yumshoq', amount: '100 г', productSlug: 'balans-yumshoq' },
      { nameRu: 'BALANS К плову', nameUz: 'BALANS Palov', amount: '100 г', productSlug: 'balans-palov' },
      { nameRu: 'Яйцо или сулугуни — к мягкому', nameUz: 'Tuxum yoki sulugini — yumshoqqa', amount: '1 шт / 40 г' },
      { nameRu: 'Горячее блюдо — к острому', nameUz: 'Issiq taom — o‘tkirga', amount: '150 г' },
    ],
    steps: [
      {
        textRu: 'Начните с мягкого: горох и татсой без горечи, к ним хорошо идёт яйцо или сулугуни — жир держит сладкий вкус.',
        textUz: "Yumshoqdan boshlang: no'xat va tatsoy achchiq emas, ularga tuxum yoki sulugini mos keladi.",
      },
      {
        textRu: 'Острый подавайте к плову или шашлыку: редис и кинза стоят рядом с горячим, а не вместо него.',
        textUz: "O'tkirni palov yoki kabobga bering: turp va kashnich issiq taom yonida turadi.",
      },
      DRESS, KEEP,
    ],
  },
  {
    slug: 'set-balans-haftasi',
    titleRu: 'Набор «Неделя BALANS»',
    titleUz: '«BALANS haftasi» to‘plami',
    descriptionRu:
      'Все четыре микса: лестница вкуса от сладковатого гороха к свекольной ноте амаранта. '
      + 'По пачке в день — четыре разных вкуса подряд.',
    descriptionUz:
      "To'rtta miks: shirinroq no'xatdan amarantning lavlagi notasigacha ta'm zinapoyasi.",
    cookMinutes: 3, servings: 4, sortOrder: 102, photo: 'set_bl2_hafta.webp',
    ingredients: [
      { nameRu: 'BALANS Мягкий', nameUz: 'BALANS Yumshoq', amount: '100 г', productSlug: 'balans-yumshoq' },
      { nameRu: 'BALANS К плову', nameUz: 'BALANS Palov', amount: '100 г', productSlug: 'balans-palov' },
      { nameRu: 'BALANS Крестоцветный', nameUz: 'BALANS Krest', amount: '100 г', productSlug: 'balans-krest' },
      { nameRu: 'BALANS Цветной', nameUz: 'BALANS Rang', amount: '100 г', productSlug: 'balans-rang' },
      { nameRu: 'Белок на каждый день', nameUz: 'Har kunga oqsil', amount: 'яйцо, курица 120 г, рыба 150 г или нут 100 г' },
    ],
    steps: [
      {
        textRu: 'Порядок вкуса: мягкий → к плову → крестоцветный → цветной. Так острота нарастает, а не бьёт с первой пачки.',
        textUz: "Ta'm tartibi: yumshoq → palov → krest → rangli. Achchiqlik asta ortadi.",
      },
      {
        textRu: 'Это ритм «по пачке в день», а не запас на неделю: срок у зелени короткий.',
        textUz: "Bu «kuniga bitta qadoq» ritmi, haftalik zaxira emas: ko'katning muddati qisqa.",
      },
      DRESS, KEEP,
    ],
  },
  {
    slug: 'set-birinchi-qadam',
    titleRu: 'Набор «Первый шаг»',
    titleUz: '«Birinchi qadam» to‘plami',
    descriptionRu:
      'Кит с готовой заправкой в саше и вторая упаковка мягкого микса. '
      + 'Первый раз — с нашей заправкой, второй — со своей.',
    descriptionUz:
      "Sashe bilan tayyor kit va yumshoq miksning ikkinchi qadog'i.",
    cookMinutes: 2, servings: 2, sortOrder: 103, photo: 'set_bl3_qadam.webp',
    ingredients: [
      { nameRu: 'Кит «Сначала зелень»', nameUz: 'Kit «Avval yashil»', amount: '1 шт', productSlug: 'balans-kit-avval' },
      { nameRu: 'BALANS Мягкий', nameUz: 'BALANS Yumshoq', amount: '100 г', productSlug: 'balans-yumshoq' },
    ],
    steps: [
      {
        textRu: 'Саше в ките — оливковое масло, винный уксус и соль. Оно лежит отдельно, чтобы зелень не осела до подачи.',
        textUz: "Kitdagi sashe — zaytun moyi, vino sirkasi va tuz. U alohida turadi.",
      },
      {
        textRu: 'Зелень подают за 10–15 минут до основного блюда — это способ подачи, а не замена еде.',
        textUz: "Ko'kat asosiy taomdan 10–15 daqiqa oldin beriladi.",
      },
      KEEP,
    ],
  },
  {
    slug: 'set-toyimli-kun',
    titleRu: 'Набор «Сытный день»',
    titleUz: '«To‘yimli kun» to‘plami',
    descriptionRu:
      'Плотный капустно-перечный вкус и 20 г семян — лён, тыква, подсолнечник. '
      + 'Перекус, который жуётся, а не проглатывается.',
    descriptionUz:
      "Zich karam-qalampir ta'mi va 20 g urug': zig'ir, qovoq, kungaboqar.",
    cookMinutes: 3, servings: 2, sortOrder: 104, photo: 'set_bl4_toyimli.webp',
    ingredients: [
      { nameRu: 'Кит «Сытный»', nameUz: 'Kit «To‘yimli»', amount: '1 шт', productSlug: 'balans-kit-toyimli' },
      { nameRu: 'BALANS Крестоцветный', nameUz: 'BALANS Krest', amount: '100 г', productSlug: 'balans-krest' },
      { nameRu: 'Сыр или яйцо', nameUz: 'Pishloq yoki tuxum', amount: '40 г / 1 шт' },
    ],
    steps: [
      {
        textRu: 'Семена держите отдельно и добавляйте перед едой: в зелени они отсыревают.',
        textUz: "Urug'larni alohida saqlang va yeyishdan oldin qo'shing.",
      },
      {
        textRu: 'Сыр или яйцо смягчают горечь крестоцветных — жир работает с ней лучше, чем кислота.',
        textUz: "Pishloq yoki tuxum krest achchiqligini yumshatadi.",
      },
      DRESS, KEEP,
    ],
  },

  // ── KUNLIK ────────────────────────────────────────────────────────────
  {
    slug: 'set-boul-asosi',
    titleRu: 'Набор «Основа боула»',
    titleUz: '«Boul asosi» to‘plami',
    descriptionRu:
      'Нейтральная база на три-четыре боула: шпинат и татсой мягкие, горох сверху даёт сладость и хруст. '
      + 'Белок, крупу и овощ добавляете свои.',
    descriptionUz:
      "Uch-to'rtta boul uchun neytral asos: ismaloq va tatsoy yumshoq, no'xat shirinlik beradi.",
    cookMinutes: 5, servings: 4, sortOrder: 111, photo: 'set_kn1_boul.webp',
    ingredients: [
      { nameRu: 'Шпинат бейби', nameUz: 'Ismaloq beybi', amount: '100 г', productSlug: 'ismaloq-baby' },
      { nameRu: 'Татсой бейби', nameUz: 'Tatsoy beybi', amount: '100 г', productSlug: 'tatsoy-baby' },
      { nameRu: 'Микрозелень гороха', nameUz: "No'xat mikroko'kati", amount: '1 лоток', productSlug: 'noxat-micro' },
      { nameRu: 'Белок: курица, тунец, нут или яйцо', nameUz: 'Oqsil: tovuq, tunets, no‘xat yoki tuxum', amount: '120–150 г' },
      { nameRu: 'Крупа: булгур, киноа или рис', nameUz: 'Yorma: bulg‘ur, kinoa yoki guruch', amount: '80 г готовой' },
      { nameRu: 'Овощ для цвета: томат, огурец, морковь', nameUz: 'Sabzavot: pomidor, bodring, sabzi', amount: '80 г' },
      { nameRu: 'Авокадо или масло', nameUz: 'Avokado yoki yog‘', amount: '¼ шт / 1 ст. л.' },
    ],
    steps: [
      {
        textRu: 'Соберите чашу слоями: сначала лист, потом крупа, потом белок. Микрозелень гороха — последней, чтобы не примялась.',
        textUz: "Boulni qatlab yig'ing: avval barg, keyin yorma, so'ng oqsil. No'xat mikroko'kati oxirida.",
      },
      {
        textRu: 'Кислота обязательна: без лимона или уксуса шпинат читается плоско.',
        textUz: "Nordonlik shart: limon yoki sirkasiz ismaloq ta'msiz bo'ladi.",
      },
      KEEP,
    ],
  },
  {
    slug: 'set-nonushtaga-kok',
    titleRu: 'Набор «Зелень к завтраку»',
    titleUz: '«Nonushtaga ko‘k» to‘plami',
    descriptionRu:
      'Для завтрака, где раньше были только яйца и хлеб: мягкий шпинат, сладковатый горох, '
      + 'пряный базилик. Аромат вместо остроты.',
    descriptionUz:
      "Ilgari faqat tuxum va non bo'lgan nonushta uchun: ismaloq, no'xat va rayhon.",
    cookMinutes: 8, servings: 4, sortOrder: 112, photo: 'set_kn2_nonushta.webp',
    ingredients: [
      { nameRu: 'Шпинат бейби', nameUz: 'Ismaloq beybi', amount: '100 г', productSlug: 'ismaloq-baby' },
      { nameRu: 'Микрозелень гороха', nameUz: "No'xat mikroko'kati", amount: '1 лоток', productSlug: 'noxat-micro' },
      { nameRu: 'Базилик бейби', nameUz: 'Rayhon beybi', amount: '100 г', productSlug: 'rayhon-baby' },
      { nameRu: 'Яйца', nameUz: 'Tuxum', amount: '2 шт' },
      { nameRu: 'Сыр', nameUz: 'Pishloq', amount: '40 г' },
      { nameRu: 'Томат', nameUz: 'Pomidor', amount: '1 шт' },
    ],
    steps: [
      {
        textRu: 'Шпинат кладите в омлет после плиты, а не на сковороду: так он остаётся зелёным и не течёт.',
        textUz: "Ismaloqni tovadan keyin qo'shing: shunda u yashil qoladi.",
      },
      {
        textRu: 'Базилик и горох — сверху, целыми листьями: их вкус читается только в свежем виде.',
        textUz: "Rayhon va no'xat — ustiga, butun barg holida.",
      },
      KEEP,
    ],
  },
  {
    slug: 'set-tamlar-haftasi',
    titleRu: 'Набор «Неделя вкусов»',
    titleUz: '«Ta’mlar haftasi» to‘plami',
    descriptionRu:
      'Четыре разных листа на неделю покупок: плотный кейл, мизуна с горчичной нотой, '
      + 'мягкий татсой и острая руккола.',
    descriptionUz:
      "Bir haftaga to'rtta turli barg: keyl, mizuna, tatsoy va rukkola.",
    cookMinutes: 5, servings: 4, sortOrder: 113, photo: 'set_kn3_tamlar.webp',
    ingredients: [
      { nameRu: 'Кейл бейби', nameUz: 'Keyl beybi', amount: '100 г', productSlug: 'keyl-baby' },
      { nameRu: 'Мизуна зелёная бейби', nameUz: 'Yashil mizuna beybi', amount: '100 г', productSlug: 'mizuna-green-baby' },
      { nameRu: 'Татсой бейби', nameUz: 'Tatsoy beybi', amount: '100 г', productSlug: 'tatsoy-baby' },
      { nameRu: 'Руккола бейби', nameUz: 'Rukkola beybi', amount: '100 г', productSlug: 'rukkola-baby' },
    ],
    steps: [
      {
        textRu: 'К рукколе — сыр и масло: жир гасит её горчичную остроту.',
        textUz: "Rukkolaga pishloq va yog': yog' uning achchiqligini yumshatadi.",
      },
      {
        textRu: 'К кейлу — кислота и орех: лимон размягчает плотный лист, орех даёт хруст.',
        textUz: "Keylga nordonlik va yong'oq: limon zich bargni yumshatadi.",
      },
      {
        textRu: 'Татсой мягкий — под него подойдёт любой белок, он ничего не перебивает.',
        textUz: "Tatsoy yumshoq — unga har qanday oqsil mos keladi.",
      },
      KEEP,
    ],
  },
  {
    slug: 'set-keyl-va-noxat',
    titleRu: 'Набор «Кейл и горох»',
    titleUz: '«Keyl va no‘xat» to‘plami',
    descriptionRu:
      'Плотный лист и сладкий побег — быстрый гарнир из двух упаковок.',
    descriptionUz: "Zich barg va shirin niholcha — ikki qadoqdan tez garnir.",
    cookMinutes: 5, servings: 3, sortOrder: 114, photo: 'set_kn4_keyl.webp',
    ingredients: [
      { nameRu: 'Кейл бейби', nameUz: 'Keyl beybi', amount: '100 г', productSlug: 'keyl-baby' },
      { nameRu: 'Микрозелень гороха', nameUz: "No'xat mikroko'kati", amount: '1 лоток', productSlug: 'noxat-micro' },
      { nameRu: 'Лимон или гранатовый сок', nameUz: 'Limon yoki anor sharbati', amount: '1 ст. л.' },
      { nameRu: 'Орех', nameUz: "Yong'oq", amount: '20 г' },
    ],
    steps: [
      {
        textRu: 'Помните кейл руками с ложкой сока минуту — плотный лист станет мягче.',
        textUz: "Keylni sharbat bilan bir daqiqa qo'lda uqalang.",
      },
      {
        textRu: 'Горох добавьте сверху целым: он сладкий и держит форму.',
        textUz: "No'xatni ustiga butun holda qo'shing.",
      },
      KEEP,
    ],
  },

  // ── FAOL ──────────────────────────────────────────────────────────────
  {
    slug: 'set-faol-boul',
    titleRu: 'Набор «Активный боул»',
    titleUz: '«Faol boul» to‘plami',
    descriptionRu:
      'Плотная база из шпината и кейла, сверху горох — в нём 4,2 г белка на 100 г, '
      + 'больше всего в ассортименте.',
    descriptionUz:
      "Ismaloq va keyldan zich asos, ustida no'xat — 100 g da 4,2 g oqsil.",
    cookMinutes: 5, servings: 4, sortOrder: 121, photo: 'set_fa1_faol.webp',
    ingredients: [
      { nameRu: 'Шпинат бейби', nameUz: 'Ismaloq beybi', amount: '100 г', productSlug: 'ismaloq-baby' },
      { nameRu: 'Кейл бейби', nameUz: 'Keyl beybi', amount: '100 г', productSlug: 'keyl-baby' },
      { nameRu: 'Микрозелень гороха', nameUz: "No'xat mikroko'kati", amount: '1 лоток', productSlug: 'noxat-micro' },
      { nameRu: 'Белок', nameUz: 'Oqsil', amount: '150 г' },
      { nameRu: 'Крупа', nameUz: 'Yorma', amount: '100 г готовой' },
    ],
    steps: [
      {
        textRu: 'Кейл и шпинат — основа, горох — верх. Крупу кладите тёплой, зелень сверху уже остывшей.',
        textUz: "Keyl va ismaloq — asos, no'xat — ust. Yormani iliq holda qo'ying.",
      },
      DRESS, KEEP,
    ],
  },
  {
    slug: 'set-zaldan-keyin',
    titleRu: 'Набор «После зала»',
    titleUz: '«Zaldan keyin» to‘plami',
    descriptionRu:
      'Ореховый подсолнечник с плотным стеблем и мягкий шпинат — два вкуса, которые не надоедают.',
    descriptionUz: "Yong'oqsimon kungaboqar va yumshoq ismaloq.",
    cookMinutes: 4, servings: 3, sortOrder: 122, photo: 'set_fa2_zal.webp',
    ingredients: [
      { nameRu: 'Микрозелень подсолнечника', nameUz: "Kungaboqar mikroko'kati", amount: '1 лоток', productSlug: 'kungaboqar-micro' },
      { nameRu: 'Шпинат бейби', nameUz: 'Ismaloq beybi', amount: '100 г', productSlug: 'ismaloq-baby' },
      { nameRu: 'Яйца или творог', nameUz: 'Tuxum yoki tvorog', amount: '2 шт / 150 г' },
      { nameRu: 'Банан или груша', nameUz: 'Banan yoki nok', amount: '1 шт' },
    ],
    steps: [
      {
        textRu: 'Подсолнечник ешьте вместе со стеблем: он сочный, и в нём весь ореховый вкус.',
        textUz: "Kungaboqarni poyasi bilan yeng: sershira va yong'oq ta'mi unda.",
      },
      {
        textRu: 'Сладкий фрукт уравновешивает ореховую ноту — отсюда банан или груша рядом.',
        textUz: "Shirin meva yong'oq notasini muvozanatlaydi.",
      },
      KEEP,
    ],
  },

  // ── OSHXONA ───────────────────────────────────────────────────────────
  {
    slug: 'set-pasta-va-salat',
    titleRu: 'Набор «Паста и салат»',
    titleUz: '«Pasta va salat» to‘plami',
    descriptionRu:
      'Пряный базилик и острая руккола — классическая пара к пасте. Сыр и масло гасят горечь.',
    descriptionUz: "Rayhon va rukkola — pastaga klassik juftlik.",
    cookMinutes: 5, servings: 4, sortOrder: 131, photo: 'set_os1_pasta.webp',
    ingredients: [
      { nameRu: 'Базилик бейби', nameUz: 'Rayhon beybi', amount: '100 г', productSlug: 'rayhon-baby' },
      { nameRu: 'Руккола бейби', nameUz: 'Rukkola beybi', amount: '100 г', productSlug: 'rukkola-baby' },
      { nameRu: 'Паста', nameUz: 'Pasta', amount: '300 г сухой' },
      { nameRu: 'Твёрдый сыр', nameUz: 'Qattiq pishloq', amount: '60 г' },
      { nameRu: 'Томаты', nameUz: 'Pomidor', amount: '200 г' },
      { nameRu: 'Оливковое масло и чеснок', nameUz: "Zaytun moyi va sarimsoq", amount: '2 ст. л.' },
    ],
    steps: [
      {
        textRu: 'Рукколу кладите в горячую пасту после плиты: выше 70 °C лист теряет вкус.',
        textUz: "Rukkolani issiq pastaga tovadan keyin qo'shing.",
      },
      {
        textRu: 'Базилик — целыми листьями сверху, резать его не нужно.',
        textUz: "Rayhonni butun barg holida ustiga qo'ying.",
      },
      KEEP,
    ],
  },
  {
    slug: 'set-yashil-tova',
    titleRu: 'Набор «Зелёная сковорода»',
    titleUz: '«Yashil tova» to‘plami',
    descriptionRu:
      'Единственный набор, где зелень греют: быстрый гарнир из шпината и мангольда с яркими стеблями.',
    descriptionUz:
      "Ko'kat qizdiriladigan yagona to'plam: ismaloq va rangli poyali mangold.",
    cookMinutes: 10, servings: 4, sortOrder: 132, photo: 'set_os2_tova.webp',
    ingredients: [
      { nameRu: 'Шпинат бейби', nameUz: 'Ismaloq beybi', amount: '100 г', productSlug: 'ismaloq-baby' },
      { nameRu: 'Мангольд бейби', nameUz: 'Mangold beybi', amount: '100 г', productSlug: 'mangold-baby' },
      { nameRu: 'Чеснок и масло', nameUz: "Sarimsoq va yog'", amount: '1 ст. л.' },
      { nameRu: 'Сливки или яйцо', nameUz: 'Qaymoq yoki tuxum', amount: '50 мл / 1 шт' },
      { nameRu: 'Мясо или рыба — отдельно', nameUz: "Go'sht yoki baliq — alohida", amount: '150 г' },
    ],
    steps: [
      {
        textRu: 'Сначала стебли мангольда, через минуту — листья и шпинат. Стебель плотнее и готовится дольше.',
        textUz: "Avval mangold poyasi, bir daqiqadan so'ng barglar va ismaloq.",
      },
      {
        textRu: 'Обжарка одна-две минуты, не дольше: это гарнир, а не тушёная зелень.',
        textUz: "Bir-ikki daqiqa qovuring, undan ortiq emas.",
      },
    ],
  },
  {
    slug: 'set-palov-va-issiq',
    titleRu: 'Набор «К плову и горячему»',
    titleUz: '«Palov va issiq taomga» to‘plami',
    descriptionRu:
      'Три лотка на стол: яркая кинза, резкий редис и перечный кресс. '
      + 'Для тех, кто кормит не одного, а компанию.',
    descriptionUz:
      "Dasturxonga uchta lotok: kashnich, turp va kress.",
    cookMinutes: 3, servings: 6, sortOrder: 133, photo: 'set_os3_palov.webp',
    ingredients: [
      { nameRu: 'Микрозелень кориандра', nameUz: "Kashnich mikroko'kati", amount: '1 лоток', productSlug: 'kashnich-micro' },
      { nameRu: 'Микрозелень редиса Ред Корал', nameUz: "Redis Red Coral mikroko'kati", amount: '1 лоток', productSlug: 'redis-micro' },
      { nameRu: 'Микрозелень кресс-салата', nameUz: "Kress-salat mikroko'kati", amount: '1 лоток', productSlug: 'kress-micro' },
      { nameRu: 'Лук и гранат', nameUz: 'Piyoz va anor', amount: 'по вкусу' },
    ],
    steps: [
      {
        textRu: 'Срезайте зелень прямо на стол, лотками: так она не вянет и остаётся хрустящей до конца обеда.',
        textUz: "Ko'katni dasturxonda lotokdan kesing: shunda u so'lmaydi.",
      },
      {
        textRu: 'Гранат и лук уравновешивают остроту редиса — сладкое против жгучего.',
        textUz: "Anor va piyoz turp achchiqligini muvozanatlaydi.",
      },
      KEEP,
    ],
  },
  {
    slug: 'set-samarqand-salati',
    titleRu: 'Набор «Самаркандский салат»',
    titleUz: '«Samarqand salati» to‘plami',
    descriptionRu:
      'Самый простой вход: лоток гороха и розовые томаты. Сладкий сочный побег к мясистому томату.',
    descriptionUz: "Eng oddiy boshlanish: no'xat lotogi va pushti pomidor.",
    cookMinutes: 5, servings: 4, sortOrder: 134, photo: 'set_os4_samarqand.webp',
    ingredients: [
      { nameRu: 'Микрозелень гороха', nameUz: "No'xat mikroko'kati", amount: '1 лоток', productSlug: 'noxat-micro' },
      { nameRu: 'Розовые томаты', nameUz: 'Pushti pomidor', amount: '400 г' },
      { nameRu: 'Оливковое масло', nameUz: "Zaytun moyi", amount: '2 ст. л.' },
      { nameRu: 'Кунжут, соль, перец', nameUz: 'Kunjut, tuz, qalampir', amount: 'по вкусу' },
    ],
    steps: [
      {
        textRu: 'Томаты режьте крупно, дольками: мелкая нарезка отдаёт сок, и салат плывёт.',
        textUz: "Pomidorni yirik bo'laklang: mayda to'g'ralganda sharbat ajraladi.",
      },
      {
        textRu: 'Горох добавьте последним и не перемешивайте — пусть лежит сверху.',
        textUz: "No'xatni oxirida qo'shing va aralashtirmang.",
      },
      DRESS,
    ],
  },

  // ── CHEF ──────────────────────────────────────────────────────────────
  {
    slug: 'set-palitra',
    titleRu: 'Набор «Палитра»',
    titleUz: '«Palitra» to‘plami',
    descriptionRu:
      'Три оттенка пурпура для финишной подачи: свекольная нота амаранта, резкий Санго, '
      + 'мизуна с горчичной нотой. Для мяса, тартара и крем-супов.',
    descriptionUz:
      "Taqdimot uchun uchta binafsha tus: amarant, Sango va qizil mizuna.",
    cookMinutes: 3, servings: 20, sortOrder: 141, photo: 'set_ch1_palitra.webp',
    ingredients: [
      { nameRu: 'Микрозелень амаранта', nameUz: "Amarant mikroko'kati", amount: '1 лоток', productSlug: 'amarant-micro' },
      { nameRu: 'Микрозелень редиса Санго', nameUz: "Redis Sango mikroko'kati", amount: '1 лоток', productSlug: 'redis-sango' },
      { nameRu: 'Микрозелень мизуны красной', nameUz: "Qizil mizuna mikroko'kati", amount: '1 лоток', productSlug: 'mizuna-red' },
    ],
    steps: [
      {
        textRu: 'Срезайте под заказ: цвет держится, пока лист не примят и не намок.',
        textUz: "Buyurtma ostida kesing: barg bosilmasa, rang saqlanadi.",
      },
      {
        textRu: 'Замены согласуются накануне: амарант меняется на пак-чой красный, Санго — на горчицу красную.',
        textUz: "Almashtirish bir kun oldin kelishiladi.",
      },
      KEEP,
    ],
  },
  {
    slug: 'set-achchiq-taqdimot',
    titleRu: 'Набор «Пряная подача»',
    titleUz: '«Achchiq taqdimot» to‘plami',
    descriptionRu:
      'Пять уровней остроты в одном заказе: резкий редис, перечный кресс, жгучая горчица, '
      + 'кинза и орехово-горчичная руккола.',
    descriptionUz:
      "Bitta buyurtmada beshta achchiqlik darajasi.",
    cookMinutes: 3, servings: 30, sortOrder: 142, photo: 'set_ch2_achchiq.webp',
    ingredients: [
      { nameRu: 'Микрозелень редиса Ред Корал', nameUz: "Redis Red Coral mikroko'kati", amount: '1 лоток', productSlug: 'redis-micro' },
      { nameRu: 'Микрозелень кресс-салата', nameUz: "Kress-salat mikroko'kati", amount: '1 лоток', productSlug: 'kress-micro' },
      { nameRu: 'Микрозелень горчицы', nameUz: "Gorchitsa mikroko'kati", amount: '1 лоток', productSlug: 'gorchitsa-micro' },
      { nameRu: 'Микрозелень кориандра', nameUz: "Kashnich mikroko'kati", amount: '1 лоток', productSlug: 'kashnich-micro' },
      { nameRu: 'Микрозелень рукколы', nameUz: "Rukkola mikroko'kati", amount: '1 лоток', productSlug: 'rukkola-micro' },
    ],
    steps: [
      {
        textRu: 'Острое ставьте к жирному: мясо, тартар, бургер. На нейтральном блюде острота работает вхолостую.',
        textUz: "Achchiqni yog'li taomga qo'ying: go'sht, tartar, burger.",
      },
      KEEP,
    ],
  },
  {
    slug: 'set-barg-va-tuzilma',
    titleRu: 'Набор «Лист и фактура»',
    titleUz: '«Barg va tuzilma» to‘plami',
    descriptionRu:
      'Три кочана под ресторанный салат, где лист виден целиком: горьковатый радичио, '
      + 'хрустящий фризе и мягкая лоло росса.',
    descriptionUz:
      "Restoran salati uchun uchta bosh: radichio, frize va lolo rossa.",
    cookMinutes: 10, servings: 20, sortOrder: 143, photo: 'set_ch3_barg.webp',
    ingredients: [
      { nameRu: 'Лоло Росса', nameUz: 'Lolo Rossa', amount: '1 кг', productSlug: 'lolo-rossa' },
      { nameRu: 'Радичио', nameUz: 'Radichio', amount: '1 кг', productSlug: 'radichio-salat' },
      { nameRu: 'Фризе', nameUz: 'Frize', amount: '1 кг', productSlug: 'frize-salat' },
    ],
    steps: [
      {
        textRu: 'Кислая заправка обязательна: горечь радичио без кислоты читается гостем как брак, а не как вкус.',
        textUz: "Nordon ziravor shart: radichio achchiqligi nordonliksiz nuqson bo'lib tuyuladi.",
      },
      {
        textRu: 'Рвите лист руками, не режьте: на срезе радичио темнеет за полчаса.',
        textUz: "Bargni qo'l bilan yiring, kesmang.",
      },
      KEEP,
    ],
  },
  {
    slug: 'set-hid',
    titleRu: 'Набор «Аромат»',
    titleUz: '«Hid» to‘plami',
    descriptionRu:
      'Для бара и кондитера: мята, пряный базилик и кислый щавель с красной жилкой — '
      + 'кислота без лимона.',
    descriptionUz:
      "Bar va qandolatchi uchun: yalpiz, rayhon va qizil tomirli shovul.",
    cookMinutes: 3, servings: 20, sortOrder: 144, photo: 'set_ch4_hid.webp',
    ingredients: [
      { nameRu: 'Мята бейби', nameUz: 'Yalpiz beybi', amount: '100 г', productSlug: 'yalpiz-baby' },
      { nameRu: 'Базилик бейби', nameUz: 'Rayhon beybi', amount: '100 г', productSlug: 'rayhon-baby' },
      { nameRu: 'Щавель Красная Лава', nameUz: 'Qizil lava shovul', amount: '100 г', productSlug: 'shavel-red-lava' },
    ],
    steps: [
      {
        textRu: 'Мяту для напитка не рвите и не мните: аромат уходит в лёд, а лист темнеет.',
        textUz: "Ichimlik uchun yalpizni ezmang: hid muzga o'tadi.",
      },
      {
        textRu: 'Щавель даёт кислоту без лимона — им хорошо заканчивать десерт, а не начинать.',
        textUz: "Shovul limonsiz nordonlik beradi.",
      },
      KEEP,
    ],
  },

  // ── Коллекции ─────────────────────────────────────────────────────────
  {
    slug: 'set-rangli-laganda',
    titleRu: 'Набор «Цветная тарелка»',
    titleUz: '«Rangli laganda» to‘plami',
    descriptionRu:
      'Тот же пурпур, что у «Палитры», но для домашнего праздничного стола: '
      + 'амарант, Санго и красная мизуна к плову и мясу.',
    descriptionUz:
      "«Palitra» dagi binafsha, ammo bayram dasturxoni uchun.",
    cookMinutes: 5, servings: 8, sortOrder: 151, photo: 'set_mh1_laganda.webp',
    ingredients: [
      { nameRu: 'Микрозелень амаранта', nameUz: "Amarant mikroko'kati", amount: '1 лоток', productSlug: 'amarant-micro' },
      { nameRu: 'Микрозелень редиса Санго', nameUz: "Redis Sango mikroko'kati", amount: '1 лоток', productSlug: 'redis-sango' },
      { nameRu: 'Микрозелень мизуны красной', nameUz: "Qizil mizuna mikroko'kati", amount: '1 лоток', productSlug: 'mizuna-red' },
      { nameRu: 'Сыр, орехи, гранат', nameUz: 'Pishloq, yong‘oq, anor', amount: 'по вкусу' },
    ],
    steps: [
      {
        textRu: 'Выложите три цвета полосами, не смешивая: смешанная зелень на большом блюде читается как один бурый цвет.',
        textUz: "Uch rangni aralashtirmasdan yo'l-yo'l qilib qo'ying.",
      },
      DRESS, KEEP,
    ],
  },
  {
    slug: 'set-ofis-kuni',
    titleRu: 'Набор «Офисный день»',
    titleUz: '«Ofis kuni» to‘plami',
    descriptionRu:
      'Четыре кита с заправкой в саше — по одному на человека. '
      + 'На работе заправку никто не смешивает, поэтому набор держится именно на ките.',
    descriptionUz:
      "Sashe bilan to'rtta kit — har kishiga bittadan.",
    cookMinutes: 2, servings: 4, sortOrder: 152, photo: 'set_is1_ofis.webp',
    ingredients: [
      { nameRu: 'Кит «Сначала зелень» ×4', nameUz: 'Kit «Avval yashil» ×4', amount: '4 шт', productSlug: 'balans-kit-avval' },
    ],
    steps: [
      {
        textRu: 'Кит вскрывают перед едой: заправка в саше лежит отдельно, и до подачи зелень не оседает.',
        textUz: "Kit yeyishdan oldin ochiladi: sashe alohida turadi.",
      },
      {
        textRu: 'Зелень идёт за 10–15 минут до обеда, а не вместо него.',
        textUz: "Ko'kat tushlikdan 10–15 daqiqa oldin, uning o'rniga emas.",
      },
      KEEP,
    ],
  },
];

async function main() {
  console.log(`🥗 Наборы: ${SETS.length} подборок`);
  let withPhoto = 0;
  const missing: string[] = [];

  for (const set of SETS) {
    // Фото ставим только если файл реально лежит: битая картинка на карточке
    // хуже её отсутствия. `RecipeCard` без heroImage рисуется без изображения.
    const hasPhoto = existsSync(join(PHOTO_DIR, set.photo));
    if (hasPhoto) withPhoto += 1;

    const data = {
      titleRu: set.titleRu,
      titleUz: set.titleUz,
      descriptionRu: set.descriptionRu,
      descriptionUz: set.descriptionUz,
      heroImage: hasPhoto ? `/catalog/${set.photo}` : null,
      cookMinutes: set.cookMinutes,
      servings: set.servings,
      sortOrder: set.sortOrder,
      isActive: true,
    };

    const recipe = await prisma.recipe.upsert({
      where: { slug: set.slug },
      update: data,
      create: { slug: set.slug, ...data },
      select: { id: true },
    });

    // Шаги и ингредиенты пересоздаём целиком: правка состава не должна
    // оставлять хвост от прежней версии.
    await prisma.recipeStep.deleteMany({ where: { recipeId: recipe.id } });
    await prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });

    await prisma.recipeStep.createMany({
      data: set.steps.map((s, i) => ({
        recipeId: recipe.id,
        order: i + 1,
        textRu: s.textRu,
        textUz: s.textUz,
      })),
    });

    // ПЕРВЫМ ИНГРЕДИЕНТОМ — САМ НАБОР, и это единственная ссылка на товар.
    //
    // Набор продаётся строкой прайса: одна цена, одна позиция в чеке. Если
    // оставить ссылки на компоненты, кнопка «собрать набор» положит их по
    // отдельности — и на сайте появятся два пути купить одно и то же по
    // разной цене. Компоненты ниже остаются текстом: они говорят, что внутри.
    const ingredients: Ingredient[] = [
      {
        nameRu: set.titleRu,
        nameUz: set.titleUz,
        amount: '1 набор',
        productSlug: productSlugOf(set.photo),
      },
      ...set.ingredients.map((ing) => ({ ...ing, productSlug: undefined })),
    ];

    for (const [i, ing] of ingredients.entries()) {
      let productId: string | null = null;
      if (ing.productSlug) {
        const product = await prisma.product.findUnique({
          where: { slug: ing.productSlug },
          select: { id: true },
        });
        if (product) productId = product.id;
        else missing.push(`${set.slug} → ${ing.productSlug}`);
      }

      await prisma.recipeIngredient.create({
        data: {
          recipeId: recipe.id,
          order: i + 1,
          nameRu: ing.nameRu,
          nameUz: ing.nameUz,
          amount: ing.amount,
          productId,
        },
      });
    }

    console.log(`  ✓ ${set.slug}${hasPhoto ? '' : '  (без фото)'}`);
  }

  console.log(`\n📷 с фото: ${withPhoto} из ${SETS.length}`);
  if (missing.length > 0) {
    // Не падаем: ингредиент останется текстом, но кнопка «собрать набор» его
    // не подхватит — а это ровно та тихая поломка, ради которой список тут.
    console.warn('⚠ товары не найдены, ингредиент останется текстом:');
    for (const m of missing) console.warn(`   ${m}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
