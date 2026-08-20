/**
 * Рецепты линейки BALANS — порядок подачи, а не диета.
 *
 * ЗАЧЕМ ЭТОТ СИД СУЩЕСТВУЕТ
 * В базе лежал ровно один рецепт — «Samarqand salati», заведённый ради QR с
 * полосы 5 первого номера. Раздел /recipe при этом открыт с главной, а в
 * админке есть своя вкладка: гость приходил на страницу с единственной
 * карточкой. Номер «Shakar va tartib» описывает метод целиком, но ни один
 * его приём не был доведён до рецепта, который можно открыть с телефона на
 * кухне.
 *
 * ⚠️ РЕГИСТР ТЕКСТА ЗАДАН §6.2 doc/balans_concept.md, А НЕ ВКУСОМ АВТОРА
 * Разрешено: состав, граммы, «источник пищевых волокон», способ подачи
 * («за 10–15 минут до основного блюда»). Запрещённые формулировки перечислены
 * в §6.2 и исполняются машиной — `node scripts/check-claims.mjs`; повторять их
 * здесь списком нельзя, файл сам входит в проверяемый контур.
 *
 * Суть правила: утверждение о СВОЙСТВЕ заменяется утверждением о СОСТАВЕ или
 * о порядке подачи. Название целевой группы — уже заявление о специальном
 * назначении, поэтому линейка выведена как МЕТОД: мы не обещаем действие на
 * человека, мы описываем порядок, в котором еда попадает на стол.
 *
 * Наука, стоящая за этими шагами, изложена в doc/dossier_glycemia.md —
 * закрытом документе, который намеренно НЕ является рекламой и потому
 * называет вещи своими именами. Здесь — только кулинария.
 *
 * Идемпотентно: upsert по slug, шаги и ингредиенты пересоздаются.
 *
 * Запуск:  cd packages/database && npx tsx prisma/seed-recipes-balans.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Ingredient {
  nameRu: string;
  nameUz: string;
  amount: string;
  /** Слаг товара — ингредиент уходит в корзину кнопкой «собрать набор». */
  productSlug?: string;
}

interface Step {
  textRu: string;
  textUz: string;
  /** Таймер на странице. Ставим только там, где ждать действительно надо. */
  timerSeconds?: number;
}

interface RecipeSeed {
  slug: string;
  titleRu: string;
  titleUz: string;
  descriptionRu: string;
  descriptionUz: string;
  cookMinutes: number;
  servings: number;
  sortOrder: number;
  ingredients: Ingredient[];
  steps: Step[];
}

const RECIPES: RecipeSeed[] = [
  // ── 1. Тот самый рецепт из печатного номера ────────────────────────────
  // Текст совпадает с полосой 11 «Shakar va tartib» дословно: гость, который
  // читает журнал и открывает страницу, должен увидеть одно и то же.
  {
    slug: 'palov-oldidan-salat',
    titleRu: 'Салат перед пловом',
    titleUz: 'Palov oldidan salat',
    descriptionRu:
      'Три минуты, пока казан отдыхает. Салат подают за 10–15 минут до плова — '
      + 'сам плов остаётся на месте, перед ним просто появляется тарелка зелени. '
      + 'Источник пищевых волокон.',
    descriptionUz:
      "Qozon dam olayotgan uch daqiqa. Salat palovdan 10–15 daqiqa oldin beriladi — "
      + "palov o'z o'rnida qoladi, undan oldin shunchaki ko'kat tarelkasi paydo bo'ladi.",
    cookMinutes: 3,
    servings: 4,
    sortOrder: 1,
    ingredients: [
      { nameRu: 'Микрозелень гороха', nameUz: "No'xat mikroko'kati", amount: '50 г', productSlug: 'noxat-micro' },
      { nameRu: 'Микрозелень редиса', nameUz: 'Turp mikroko’kati', amount: '30 г', productSlug: 'redis-micro' },
      { nameRu: 'Микрозелень брокколи', nameUz: "Brokkoli mikroko'kati", amount: '20 г', productSlug: 'brokkoli-micro' },
      { nameRu: 'Оливковое масло', nameUz: "Zaytun yog'i", amount: '1 ст. л.' },
      { nameRu: 'Винный уксус', nameUz: 'Vino sirkasi', amount: '1 ч. л.' },
      { nameRu: 'Соль', nameUz: 'Tuz', amount: 'щепотка' },
    ],
    steps: [
      {
        textRu: 'Высыпьте микс в широкое блюдо, не приминая: примятая зелень теряет объём и оседает.',
        textUz: "Miksni katta laganga soling, bosmang: bosilgan ko'kat hajmini yo'qotadi.",
      },
      {
        textRu: 'Масло, уксус и соль смешайте отдельно и влейте только перед подачей.',
        textUz: "Yog', sirka va tuzni alohida aralashtiring va faqat berishdan oldin quying.",
      },
      {
        textRu: 'Перемешайте и ешьте сразу — заправленный салат оседает за час.',
        textUz: "Aralashtiring va darhol yeng — sous solingan salat bir soatda cho'kadi.",
      },
      {
        textRu: 'Через 10–15 минут подавайте плов.',
        textUz: "10–15 daqiqadan keyin palovni oling.",
        timerSeconds: 780,
      },
    ],
  },

  // ── 2. Приём, за который в номере прямо написано «бесплатный» ─────────
  {
    slug: 'kechagi-palov',
    titleRu: 'Вчерашний плов',
    titleUz: 'Kechagi palov',
    descriptionRu:
      'Плов готовят накануне, ночь держат в холодильнике и разогревают назавтра. '
      + 'При охлаждении часть крахмала риса переходит в резистентный — форму, которая '
      + 'не расщепляется в тонком кишечнике и после разогрева остаётся такой же. '
      + 'Вкус не портится: многие считают, что становится лучше.',
    descriptionUz:
      "Palov kechqurun pishiriladi, bir kecha muzlatgichda turadi va ertasi kuni qizdiriladi. "
      + "Sovutilganda guruch kraxmalining bir qismi rezistent kraxmalga aylanadi.",
    cookMinutes: 20,
    servings: 6,
    sortOrder: 2,
    ingredients: [
      { nameRu: 'Готовый плов', nameUz: 'Tayyor palov', amount: 'вчерашний' },
      { nameRu: 'Микрозелень гороха', nameUz: "No'xat mikroko'kati", amount: '50 г', productSlug: 'noxat-micro' },
      { nameRu: 'Микрозелень красной капусты', nameUz: "Qizil karam mikroko'kati", amount: '30 г', productSlug: 'qizil-karam-micro' },
      { nameRu: 'Гранатовый сок', nameUz: 'Anor sharbati', amount: '1 ч. л.' },
      { nameRu: 'Оливковое масло', nameUz: "Zaytun yog'i", amount: '1 ст. л.' },
    ],
    steps: [
      {
        textRu: 'Готовый плов остудите и уберите в холодильник на ночь — не меньше 12 часов при 4 °C.',
        textUz: "Tayyor palovni sovuting va bir kechaga muzlatgichga oling — 4 °C da kamida 12 soat.",
      },
      {
        textRu: 'Назавтра разогрейте обычным способом. Свойство, полученное при охлаждении, сохраняется.',
        textUz: "Ertasi kuni odatdagidek qizdiring. Sovutishda olingan xususiyat saqlanadi.",
      },
      {
        textRu: 'Пока плов греется, заправьте зелень маслом и гранатовым соком.',
        textUz: "Palov qizigunicha ko'katni yog' va anor sharbati bilan aralashtiring.",
      },
      {
        textRu: 'Тарелку зелени подайте первой, плов — через 10–15 минут.',
        textUz: "Avval ko'kat tarelkasini bering, palovni 10–15 daqiqadan keyin.",
        timerSeconds: 780,
      },
    ],
  },

  // ── 3. Завтрак: белок и зелень раньше хлеба ────────────────────────────
  {
    slug: 'yashil-boshlanish',
    titleRu: 'Зелёный старт',
    titleUz: 'Yashil boshlanish',
    descriptionRu:
      'Завтрак, где лепёшка приходит последней. Яйцо и зелень занимают первые пять минут, '
      + 'хлеб и чай — то, что после. Ничего не нужно исключать из меню, меняется только порядок.',
    descriptionUz:
      "Non oxirida keladigan nonushta. Tuxum va ko'kat birinchi besh daqiqani egallaydi, "
      + "non va choy — keyin. Menyudan hech narsani olib tashlash shart emas.",
    cookMinutes: 8,
    servings: 1,
    sortOrder: 3,
    ingredients: [
      { nameRu: 'Яйцо', nameUz: 'Tuxum', amount: '2 шт.' },
      { nameRu: 'Микрозелень подсолнуха', nameUz: "Kungaboqar mikroko'kati", amount: '30 г', productSlug: 'kungaboqar-micro' },
      { nameRu: 'Микрозелень редиса', nameUz: 'Turp mikroko’kati', amount: '20 г', productSlug: 'redis-micro' },
      { nameRu: 'Помидор', nameUz: 'Pomidor', amount: '1 шт.' },
      { nameRu: 'Оливковое масло', nameUz: "Zaytun yog'i", amount: '1 ч. л.' },
      { nameRu: 'Соль', nameUz: 'Tuz', amount: 'щепотка' },
    ],
    steps: [
      {
        textRu: 'Отварите яйца всмятку — 6 минут с момента закипания.',
        textUz: "Tuxumni yumshoq qilib qaynating — qaynagandan keyin 6 daqiqa.",
        timerSeconds: 360,
      },
      {
        textRu: 'Помидор нарежьте, посолите, добавьте масло.',
        textUz: "Pomidorni to'g'rang, tuz seping, yog' qo'shing.",
      },
      {
        textRu: 'Микрозелень положите сверху не нарезая и не нагревая: выше 70 °C она теряет вкус и аромат.',
        textUz: "Mikroko'katni to'g'ramasdan va isitmasdan ustiga qo'ying: 70 °C dan yuqorida ta'm yo'qoladi.",
      },
      {
        textRu: 'Съешьте яйцо и зелень первыми. Лепёшку и чай — после, не отменяя их.',
        textUz: "Avval tuxum va ko'katni yeng. Non va choyni keyin — ularni bekor qilmasdan.",
      },
    ],
  },

  // ── 4. Правило тарелки с полосы 6 ──────────────────────────────────────
  {
    slug: 'yarmi-sabzavot',
    titleRu: 'Половина тарелки',
    titleUz: 'Yarmi — sabzavot',
    descriptionRu:
      'Не рецепт блюда, а способ собрать тарелку: половина — овощи и зелень, '
      + 'четверть — белок, четверть — то, что вы и так собирались съесть. '
      + 'Работает с любым домашним обедом, включая лагман и манты.',
    descriptionUz:
      "Bu taom retsepti emas, tarelkani yig'ish usuli: yarmi — sabzavot va ko'kat, "
      + "chorak qismi — oqsil, chorak qismi — o'zingiz rejalashtirgan narsa.",
    cookMinutes: 5,
    servings: 1,
    sortOrder: 4,
    ingredients: [
      { nameRu: 'Микрозелень (любой микс)', nameUz: "Mikroko'kat (istalgan miks)", amount: '50 г', productSlug: 'brokkoli-micro' },
      { nameRu: 'Микрозелень рукколы', nameUz: "Rukkola mikroko'kati", amount: '20 г', productSlug: 'rukkola-micro' },
      { nameRu: 'Свежие овощи по сезону', nameUz: 'Mavsumiy sabzavotlar', amount: '150 г' },
      { nameRu: 'Белок: мясо, рыба, творог или фасоль', nameUz: 'Oqsil: go’sht, baliq, tvorog yoki loviya', amount: '100 г' },
      { nameRu: 'Лимонный сок', nameUz: 'Limon sharbati', amount: '1 ч. л.' },
    ],
    steps: [
      {
        textRu: 'Мысленно разделите тарелку пополам. Одну половину займите овощами и микрозеленью.',
        textUz: "Tarelkani xayolan ikkiga bo'ling. Yarmini sabzavot va mikroko'kat bilan to'ldiring.",
      },
      {
        textRu: 'Вторую половину разделите ещё раз: белок и гарнир поровну.',
        textUz: "Ikkinchi yarmini yana bo'ling: oqsil va garnir teng.",
      },
      {
        textRu: 'Сбрызните зелень лимонным соком перед самой подачей.',
        textUz: "Berishdan oldin ko'katni limon sharbati bilan namlang.",
      },
      {
        textRu: 'Начните с овощной половины и жуйте тщательно — вкус зелени раскрывается, когда разрушается ткань листа.',
        textUz: "Sabzavot yarmidan boshlang va yaxshilab chaynang — ta'm to'qima buzilganda ochiladi.",
      },
    ],
  },

  // ── 5. Заправка, которая не топит зелень ───────────────────────────────
  {
    slug: 'nordon-urgu',
    titleRu: 'Кислая заправка',
    titleUz: 'Nordon urg’u',
    descriptionRu:
      'Базовая заправка BALANS на три порции зелени. Готовится отдельно и добавляется '
      + 'в последнюю минуту: в кислоте микрозелень оседает за час, поэтому салат заправляют '
      + 'при гостях, а не до их прихода.',
    descriptionUz:
      "Uch porsiya ko'kat uchun asosiy BALANS sousi. Alohida tayyorlanadi va oxirgi "
      + "daqiqada qo'shiladi: kislotada mikroko'kat bir soatda cho'kadi.",
    cookMinutes: 2,
    servings: 3,
    sortOrder: 5,
    ingredients: [
      { nameRu: 'Оливковое масло', nameUz: "Zaytun yog'i", amount: '3 ст. л.' },
      { nameRu: 'Винный уксус или гранатовый сок', nameUz: 'Vino sirkasi yoki anor sharbati', amount: '1 ст. л.' },
      { nameRu: 'Микрозелень горчицы', nameUz: "Xantal mikroko'kati", amount: '10 г', productSlug: 'xantal-micro' },
      { nameRu: 'Соль', nameUz: 'Tuz', amount: 'щепотка' },
      { nameRu: 'Кунжут', nameUz: 'Kunjut', amount: 'по вкусу' },
    ],
    steps: [
      {
        textRu: 'Смешайте масло, уксус и соль в банке и встряхните до однородности.',
        textUz: "Yog', sirka va tuzni bankaga soling va bir xil bo'lguncha chayqating.",
      },
      {
        textRu: 'Микрозелень горчицы разотрите пальцами и добавьте в заправку — она даёт остроту без перца.',
        textUz: "Xantal mikroko'katini barmoq bilan ezib sousga qo'shing — u murchsiz achchiqlik beradi.",
      },
      {
        textRu: 'Кунжут обжарьте на сухой сковороде и остудите. В горячем виде на зелень не кладут.',
        textUz: "Kunjutni quruq tovada qovuring va sovuting. Issiq holda ko'katga solinmaydi.",
      },
      {
        textRu: 'Заправку храните в холодильнике до трёх дней, зелень заправляйте только перед подачей.',
        textUz: "Sousni muzlatgichda uch kungacha saqlang, ko'katni faqat berishdan oldin aralashtiring.",
      },
    ],
  },
];

async function main() {
  // Слаги товаров резолвим один раз: ингредиент без товара — просто строка,
  // с товаром — кнопка «собрать набор», которая кладёт его в корзину.
  const slugs = [...new Set(RECIPES.flatMap((r) => r.ingredients.map((i) => i.productSlug).filter(Boolean)))] as string[];
  const products = await prisma.product.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true },
  });
  const idBySlug = new Map(products.map((p) => [p.slug, p.id]));

  const missing = slugs.filter((s) => !idBySlug.has(s));
  if (missing.length) {
    console.warn(`⚠ товары не найдены: ${missing.join(', ')}`);
    console.warn('  ингредиенты останутся текстом, «собрать набор» по ним не сработает');
    console.warn('  сначала прогоните каталог: npx tsx prisma/seed.ts');
  }

  for (const seed of RECIPES) {
    const data = {
      titleRu: seed.titleRu,
      titleUz: seed.titleUz,
      descriptionRu: seed.descriptionRu,
      descriptionUz: seed.descriptionUz,
      cookMinutes: seed.cookMinutes,
      servings: seed.servings,
      isActive: true,
      sortOrder: seed.sortOrder,
    };

    const recipe = await prisma.recipe.upsert({
      where: { slug: seed.slug },
      update: data,
      create: { slug: seed.slug, ...data },
      select: { id: true, slug: true },
    });

    // Пересоздаём: правка текста в сиде должна доезжать до базы, а порядок
    // шагов — оставаться тем же, что напечатан в журнале.
    await prisma.recipeStep.deleteMany({ where: { recipeId: recipe.id } });
    await prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });

    await prisma.recipeStep.createMany({
      data: seed.steps.map((s, i) => ({
        recipeId: recipe.id,
        order: i + 1,
        textRu: s.textRu,
        textUz: s.textUz,
        timerSeconds: s.timerSeconds ?? null,
      })),
    });

    await prisma.recipeIngredient.createMany({
      data: seed.ingredients.map((ing, i) => ({
        recipeId: recipe.id,
        order: i + 1,
        nameRu: ing.nameRu,
        nameUz: ing.nameUz,
        amount: ing.amount,
        productId: ing.productSlug ? idBySlug.get(ing.productSlug) ?? null : null,
      })),
    });

    const linked = seed.ingredients.filter((i) => i.productSlug && idBySlug.has(i.productSlug)).length;
    console.log(`✓ /recipe/${recipe.slug} — шагов ${seed.steps.length}, ингредиентов ${seed.ingredients.length}, в корзину ${linked}`);
  }

  console.log(`\nГотово: ${RECIPES.length} рецептов. Проверьте формулировки: node scripts/check-claims.mjs`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
