import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { requireBotAuth } from '@/lib/botAuth';

// ==========================================
// Catalog export — the storefront catalog is the master. The tgas AI-office
// pulls this to mirror products into microgreen.products (keyed by storefront id),
// so the sales_bot / CRM reference the same items customers see and order_items
// can be written office-side. Bot-auth gated (BOT_SECRET).
// ==========================================
export async function GET(request: NextRequest) {
  if (!requireBotAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      nameUz: true,
      nameRu: true,
      price: true,
      stock: true,
      category: { select: { slug: true } },
    },
  });

  return NextResponse.json({
    products: products.map((p) => ({
      id: p.id,
      nameUz: p.nameUz,
      nameRu: p.nameRu,
      price: p.price,
      stock: p.stock,
      categorySlug: p.category?.slug ?? null,
    })),
  });
}
