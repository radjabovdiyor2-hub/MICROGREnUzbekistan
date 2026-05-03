const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const start = Date.now();
    console.log('Connecting to database...');
    const userCount = await prisma.user.count();
    const productCount = await prisma.product.count();
    console.log(`Connected successfully in ${Date.now() - start}ms`);
    console.log(`User count: ${userCount}`);
    console.log(`Product count: ${productCount}`);
  } catch (err) {
    console.error('Database connection failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
