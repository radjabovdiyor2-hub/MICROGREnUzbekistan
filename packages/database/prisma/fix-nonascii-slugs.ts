/**
 * Чинит уже созданные записи с не-ASCII слагом.
 *
 * ЗАЧЕМ
 * slugify для рецептов сохранял кириллицу, поэтому рецепт, созданный в админке
 * с названием по-русски, получал адрес вида /recipe/укц — и страница отдавала
 * 404. Проверено на стенде: две одинаковые записи, отличается только слаг —
 * латиница даёт 200, кириллица 404.
 *
 * Сам slugify исправлен (apps/web/src/lib/slug.ts транслитерирует), но это
 * чинит только НОВЫЕ записи. Этот скрипт приводит в порядок старые.
 *
 * Идемпотентно и безопасно: трогает только записи, где слаг содержит что-то
 * кроме [a-z0-9-]. Показывает план и требует --apply, чтобы записать.
 *
 * ⚠️ Слаг — это публичный адрес. Если на него уже ведёт напечатанный QR,
 * менять нельзя: код на бумаге не переделать. Скрипт печатает старый и новый
 * адрес, чтобы вы могли решить до записи.
 *
 * Запуск:
 *   npx tsx prisma/fix-nonascii-slugs.ts           — только показать
 *   npx tsx prisma/fix-nonascii-slugs.ts --apply   — записать
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TRANSLIT: Record<string, string> = {
  ш: 'sh', щ: 'sch', ч: 'ch', ц: 'ts', ж: 'zh', ю: 'yu', я: 'ya', ё: 'yo',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ы: 'y', э: 'e', ъ: '', ь: '',
  ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};

// Та же логика, что в apps/web/src/lib/slug.ts — менять синхронно.
function slugify(source: string, fallback = 'item'): string {
  let out = '';
  for (const ch of (source || '').toLowerCase().trim()) {
    out += ch in TRANSLIT ? TRANSLIT[ch] : ch;
  }
  out = out.replace(/[^a-z0-9]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
  return out || `${fallback}-${Date.now().toString(36)}`;
}

const isSafe = (s: string) => /^[a-z0-9-]+$/.test(s);
const APPLY = process.argv.includes('--apply');

async function uniqueSlug(base: string, takenBy: string): Promise<string> {
  let candidate = base;
  for (let n = 2; n < 100; n++) {
    const clash = await prisma.recipe.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!clash || clash.id === takenBy) return candidate;
    candidate = `${base}-${n}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function main() {
  const recipes = await prisma.recipe.findMany({ select: { id: true, slug: true, titleRu: true } });
  const broken = recipes.filter((r) => !isSafe(r.slug));

  if (!broken.length) {
    console.log(`✓ все слаги рецептов пригодны для адреса (проверено: ${recipes.length})`);
    return;
  }

  console.log(`Найдено записей с непригодным слагом: ${broken.length}\n`);
  for (const r of broken) {
    const next = await uniqueSlug(slugify(r.titleRu, 'recipe'), r.id);
    console.log(`  «${r.titleRu}»`);
    console.log(`     было:  /recipe/${r.slug}   ← отдаёт 404`);
    console.log(`     станет: /recipe/${next}`);
    if (APPLY) {
      await prisma.recipe.update({ where: { id: r.id }, data: { slug: next } });
      console.log('     записано');
    }
    console.log();
  }

  if (!APPLY) {
    console.log('Ничего не записано. Чтобы применить: npx tsx prisma/fix-nonascii-slugs.ts --apply');
    console.log('Проверьте, не ведёт ли на старый адрес уже напечатанный QR.');
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
