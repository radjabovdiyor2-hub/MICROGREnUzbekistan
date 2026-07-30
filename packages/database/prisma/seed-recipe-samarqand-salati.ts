/**
 * Рецепт «Samarqand salati» — тот, на который ведёт QR с полосы 5 печатного
 * номера FRESH WEEKLY №1 (content/generated/jasmin-print.html).
 *
 * ЗАЧЕМ ЭТОТ СИД СУЩЕСТВУЕТ
 * В конфиге номера стоит recipeSlug: "samarqand-salati", и QR закодирован на
 * https://microgreenuzbekistan.com/recipe/samarqand-salati. При этом рецепты
 * в базе создаются ТОЛЬКО через админский API POST /api/admin/magazine/recipes,
 * ни один сид их не заводил, а экрана рецептов в админке не было. То есть
 * таблица recipes пуста, loadRecipeBySlug возвращает null, страница отдаёт
 * notFound() — и напечатанный QR ведёт на 404.
 *
 * Текст здесь совпадает с напечатанным дословно: гость, отсканировавший код,
 * должен увидеть тот же рецепт, что у него в руках. Если правите рецепт в
 * админке — печать и веб разойдутся, это нормально для следующего номера, но
 * для №1 они должны совпадать.
 *
 * Идемпотентно: upsert по slug, шаги и ингредиенты пересоздаются.
 *
 * Запуск:  cd packages/database && npx tsx prisma/seed-recipe-samarqand-salati.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SLUG = 'samarqand-salati';

// Микрозелень гороха — продаваемый ингредиент. Связь с товаром включает на
// странице кнопку «собрать набор»: ингредиент уходит в корзину.
const PEA_PRODUCT_SLUG = 'noxat-micro';

const INGREDIENTS = [
  { nameRu: 'Розовые томаты', nameUz: 'Pushti pomidor', amount: '200 г', productSlug: null },
  { nameRu: 'Микрозелень гороха', nameUz: "No'xat mikroko'kati", amount: '30 г', productSlug: PEA_PRODUCT_SLUG },
  { nameRu: 'Оливковое масло', nameUz: "Zaytun yog'i", amount: '1 ст. л.', productSlug: null },
  { nameRu: 'Кунжут', nameUz: 'Kunjut', amount: 'по вкусу', productSlug: null },
  { nameRu: 'Соль, чёрный перец', nameUz: 'Tuz, qora murch', amount: 'по вкусу', productSlug: null },
];

const STEPS = [
  {
    textRu: 'Нарежьте томаты крупно, посолите и дайте постоять 5 минут — пустят сок.',
    textUz: "Pomidorni yirik bo'laklarga to'g'rang, tuz sepib 5 daqiqa turing — sharbat ajralsin.",
    // 5 минут ожидания — единственный шаг, где таймер на странице к месту
    timerSeconds: 300,
  },
  {
    textRu: 'Смешайте с оливковым маслом и чёрным перцем.',
    textUz: "Zaytun yog'i va murch bilan aralashtiring.",
    timerSeconds: null,
  },
  {
    textRu: 'Микрозелень добавьте в самом конце и сразу подавайте — на жаре она теряет аромат.',
    textUz: "Mikroko'katni eng oxirida soling va darhol dasturxonga tortlang.",
    timerSeconds: null,
  },
];

async function main() {
  const pea = await prisma.product.findUnique({ where: { slug: PEA_PRODUCT_SLUG }, select: { id: true } });
  if (!pea) {
    console.warn(`⚠ товар ${PEA_PRODUCT_SLUG} не найден — ингредиент не свяжется с корзиной`);
    console.warn('  сначала прогоните каталог: npx tsx prisma/seed.ts');
  }

  const recipe = await prisma.recipe.upsert({
    where: { slug: SLUG },
    update: {
      titleRu: 'Самаркандский салат',
      titleUz: 'Samarqand salati',
      descriptionRu:
        'Салат с микрозеленью гороха и розовыми томатами — 15 минут, три ингредиента. '
        + 'Рецепт из печатного номера FRESH WEEKLY: свежесть зелени решает всё, '
        + 'поэтому микрозелень добавляют последней.',
      descriptionUz:
        "No'xat mikroko'kati va pushti pomidor bilan salat — 15 daqiqa, uchta asosiy masalliq.",
      cookMinutes: 15,
      servings: 2,
      isActive: true,
    },
    create: {
      slug: SLUG,
      titleRu: 'Самаркандский салат',
      titleUz: 'Samarqand salati',
      descriptionRu:
        'Салат с микрозеленью гороха и розовыми томатами — 15 минут, три ингредиента. '
        + 'Рецепт из печатного номера FRESH WEEKLY: свежесть зелени решает всё, '
        + 'поэтому микрозелень добавляют последней.',
      descriptionUz:
        "No'xat mikroko'kati va pushti pomidor bilan salat — 15 daqiqa, uchta asosiy masalliq.",
      cookMinutes: 15,
      servings: 2,
      isActive: true,
      sortOrder: 0,
    },
    select: { id: true, slug: true },
  });

  // Шаги и ингредиенты пересоздаём: правка текста в сиде должна доезжать,
  // а порядок — оставаться тем же, что в журнале.
  await prisma.recipeStep.deleteMany({ where: { recipeId: recipe.id } });
  await prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });

  await prisma.recipeStep.createMany({
    data: STEPS.map((s, i) => ({
      recipeId: recipe.id,
      order: i + 1,
      textRu: s.textRu,
      textUz: s.textUz,
      timerSeconds: s.timerSeconds,
    })),
  });

  await prisma.recipeIngredient.createMany({
    data: INGREDIENTS.map((ing, i) => ({
      recipeId: recipe.id,
      order: i + 1,
      nameRu: ing.nameRu,
      nameUz: ing.nameUz,
      amount: ing.amount,
      productId: ing.productSlug && pea ? pea.id : null,
    })),
  });

  console.log(`✓ рецепт /recipe/${recipe.slug}`);
  console.log(`  шагов: ${STEPS.length}, ингредиентов: ${INGREDIENTS.length}`);
  console.log(`  «собрать набор»: ${pea ? 'работает (микрозелень гороха связана с товаром)' : 'НЕ работает — товар не найден'}`);
  console.log('\nQR с полосы 5 печатного номера теперь ведёт на существующую страницу.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
