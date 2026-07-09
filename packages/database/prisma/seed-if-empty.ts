import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Bootstrap seed guard for production deploys.
// The storefront DB (microgreen_db) gets its schema from `prisma db push`
// (compose service `db-push`) but NO data — so a fresh/empty prod comes up with
// an empty catalog. This runs the full seed ONLY when the catalog is empty, so:
//   - empty prod  -> catalog is populated
//   - populated prod -> skipped (never overwrites admin-edited prices/stock,
//     which seed.ts's upsert `update` branch would otherwise reset)
// Safe to run on every deploy. Web does NOT depend on this completing.
async function run() {
  const prisma = new PrismaClient();
  let count = 0;
  try {
    count = await prisma.product.count();
  } finally {
    await prisma.$disconnect();
  }

  if (count > 0) {
    console.log(`🌱 seed-if-empty: catalog already has ${count} products — skipping.`);
    return;
  }

  console.log('🌱 seed-if-empty: catalog is empty — running full seed…');
  // Run seed.ts (sibling file) to completion as a subprocess. Resolve its
  // absolute path from this module's URL so it's independent of the launch cwd.
  const seedPath = fileURLToPath(new URL('./seed.ts', import.meta.url));
  execSync(`npx tsx "${seedPath}"`, { stdio: 'inherit' });
}

run().catch((e) => {
  console.error('seed-if-empty failed:', e);
  process.exit(1);
});
