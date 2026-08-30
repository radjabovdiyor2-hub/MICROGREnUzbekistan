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
 * Идемпотентно: upsert по slug. Повторный прогон не создаёт второй номер и
 * не трогает флаг публикации, если номер уже заведён руками.
 *
 * Запуск:  cd packages/database && npx tsx prisma/seed-magazine-issue.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SLUG = 'shakar-01';

async function main() {
  const issue = await prisma.magazineIssue.upsert({
    where: { slug: SLUG },
    update: {
      // Вёрстку и PDF обновляем: файлы могли переехать. Публикацию — нет,
      // это решение владельца, а не сида.
      webUrl: `/magazine/${SLUG}.html`,
      pdfUrl: `/magazine/${SLUG}.pdf`,
      coverImage: `/magazine/${SLUG}/${SLUG}-cover.jpg`,
    },
    create: {
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

  console.log(`✓ Номер №${issue.number} «${issue.titleRu}» — /magazine/${issue.slug}.html`);
  console.log(`  публикация: ${issue.isPublished ? 'да' : 'нет (черновик)'}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
