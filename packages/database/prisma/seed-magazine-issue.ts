/**
 * FRESH WEEKLY — карточка вышедшего номера.
 *
 * ЧТО ЗДЕСЬ БЫЛО. Сид собирал выдуманный выпуск из блоков (`MagazineEdition`
 * + `RestaurantIssue`) — сущностей автоконвейера, которого больше нет; типы
 * блоков в нём (`newsDigest`, `fitness`) разошлись со схемой ещё раньше.
 *
 * ЧТО ЗДЕСЬ СЕЙЧАС. Регистрация НАСТОЯЩЕГО номера, который уже лежит в
 * `apps/web/public/magazine`: спецвыпуск «Shakar va tartib» — тот самый,
 * что бот отдаёт по /magazine и что открывается на сайте. Файлы верстает и
 * публикует `scripts/publish-magazine.mjs`; база хранит карточку.
 *
 * ЗАПУСКАЕТСЯ НА КАЖДОМ ДЕПЛОЕ (`seed-if-empty.ts`), поэтому осторожен:
 *   · номер с этим slug есть      → обновляет только пути к файлам;
 *   · номера ведёт владелец сам   → не вмешивается вовсе;
 *   · номеров нет ни одного       → заводит этот.
 * Так удалённый номер не воскресает на следующей выкатке, а свежий прод не
 * показывает «номер готовится», когда номер лежит рядом в образе.
 *
 * Запуск вручную:  cd packages/database && npx tsx prisma/seed-magazine-issue.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SLUG = 'shakar-01';

async function main() {
  const existing = await prisma.magazineIssue.findUnique({ where: { slug: SLUG } });

  if (existing) {
    // Пути к файлам обновляем: номер мог переехать вместе с образом.
    // Название, темы и публикацию — нет, это правки владельца.
    const issue = await prisma.magazineIssue.update({
      where: { slug: SLUG },
      data: {
        webUrl: `/magazine/${SLUG}.html`,
        pdfUrl: `/magazine/${SLUG}.pdf`,
        coverImage: `/magazine/${SLUG}/${SLUG}-cover.jpg`,
      },
    });
    console.log(`✓ Номер №${issue.number} «${issue.titleRu}» на месте, пути к файлам сверены`);
    return;
  }

  const anyIssue = await prisma.magazineIssue.count();
  if (anyIssue > 0) {
    console.log(`✓ Номера ведёт владелец (${anyIssue} шт.) — сидер не вмешивается`);
    return;
  }

  const issue = await prisma.magazineIssue.create({
    data: {
      number: 3,
      slug: SLUG,
      titleRu: 'Сахар и порядок',
      titleUz: 'Shakar va tartib',
      summaryRu:
        'Спецвыпуск о том, в каком порядке есть привычные блюда: зелень до плова, ' +
        'а не после. 12 полос, метод BALANS и разбор без обещаний вылечить.',
      summaryUz:
        'Odatdagi taomlarni qanday tartibda yeyish haqida maxsus son: koʻkat ' +
        'palovdan oldin. 12 sahifa va BALANS usuli.',
      coverImage: `/magazine/${SLUG}/${SLUG}-cover.jpg`,
      webUrl: `/magazine/${SLUG}.html`,
      pdfUrl: `/magazine/${SLUG}.pdf`,
      topics: ['health', 'recipes', 'home'],
      isPublished: true,
      publishedAt: new Date(),
    },
  });

  console.log(`✓ Заведён номер №${issue.number} «${issue.titleRu}» — /magazine/${issue.slug}.html`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
