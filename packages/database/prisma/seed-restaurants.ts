import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding restaurants...');

  // Path to the markdown file
  const mdPath = path.resolve(__dirname, '../../../content/restaurant_database.md');
  const content = fs.readFileSync(mdPath, 'utf-8');

  // Regex to match sections and restaurant blocks
  const lines = content.split('\n');
  
  let currentCity = '';
  let currentTier = '';

  const restaurants = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match City
    if (line.startsWith('# 🏙 ТАШКЕНТ')) currentCity = 'tashkent';
    else if (line.startsWith('# 🕌 САМАРКАНД')) currentCity = 'samarkand';

    // Match Tier
    else if (line.match(/^## [A-D]\. /)) {
      if (line.includes('Премиум')) currentTier = 'premium';
      else if (line.includes('Традиционная')) currentTier = 'traditional';
      else if (line.includes('Паназиатская') || line.includes('Международная')) currentTier = 'cafe';
      else if (line.includes('Туристические') || line.includes('Кондитерские')) currentTier = 'tourist';
      else currentTier = 'cafe';
    }

    // Match Restaurant
    else if (line.match(/^### \d+\. /) && !line.includes('Silk Road Samarkand')) {
      const nameRaw = line.replace(/^### \d+\. /, '').trim();
      // Remove stars and comments in parentheses for the clean name
      const cleanName = nameRaw.split('⭐')[0].split('(')[0].trim();
      
      let cuisineRaw = '';
      let dishesRaw = '';
      let microgreensRaw = '';

      // Read next lines for details
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith('### ') && !lines[j].startsWith('## ')) {
        const detailLine = lines[j].trim();
        if (detailLine.startsWith('- **Кухня:**')) {
          cuisineRaw = detailLine.replace('- **Кухня:**', '').trim();
        } else if (detailLine.startsWith('- **Блюда:**')) {
          dishesRaw = detailLine.replace('- **Блюда:**', '').trim();
        } else if (detailLine.startsWith('- **Микрозелень:**')) {
          microgreensRaw = detailLine.replace('- **Микрозелень:**', '').trim();
        }
        j++;
      }

      // Parse cuisines
      const cuisine = cuisineRaw ? cuisineRaw.split(',').map(c => c.trim().toLowerCase()) : [];
      
      // Parse dishes
      const dishes = dishesRaw ? dishesRaw.split(',').map(d => d.trim()) : [];

      // Parse microgreens and flowers
      const microgreens: string[] = [];
      const flowers: string[] = [];
      
      if (microgreensRaw) {
        const tokens = microgreensRaw.split(/[|+]/); // Split by | or +
        for (let token of tokens) {
          token = token.trim();
          if (token.includes('🌱') || token.includes('💜')) {
             const cleanToken = token.replace(/🌱|💜/g, '').split('к ')[0].trim(); // Remove icon and "к блюду"
             if (cleanToken && !microgreens.includes(cleanToken)) {
                 microgreens.push(cleanToken);
             }
          }
          if (token.includes('🌸')) {
             const cleanToken = token.replace(/🌸/g, '').split('к ')[0].trim();
             if (cleanToken && !flowers.includes(cleanToken)) {
                 flowers.push(cleanToken);
             }
          }
        }
      }

      restaurants.push({
        name: cleanName,
        city: currentCity || 'tashkent',
        tier: currentTier || 'traditional',
        cuisine,
        dishes,
        microgreens,
        flowers,
        note: nameRaw !== cleanName ? nameRaw : null, // Save original name with star as a note
      });
    }
  }

  console.log(`Found ${restaurants.length} restaurants in Markdown.`);

  // Clear existing
  await prisma.restaurant.deleteMany();
  console.log('Deleted existing restaurants.');

  // Insert new
  const result = await prisma.restaurant.createMany({
    data: restaurants,
  });

  console.log(`Successfully seeded ${result.count} restaurants.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
