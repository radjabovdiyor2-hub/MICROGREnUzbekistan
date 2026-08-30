import Link from 'next/link';
import { formatPrice } from '@/lib/magazine/menu';

// Товар, к которому ведёт материал. Ради него рубрика скидок и существует:
// без этой карточки текст про набор к салату заканчивается ничем.
export function MagazineArticleProduct({ product }: {
  product: { id: string; nameRu: string; price: number; images: string[] };
}) {
  const price = formatPrice(product.price);

  return (
    <Link
      href={`/product/${product.id}`}
      style={{
        display: 'flex', gap: 16, alignItems: 'center', marginTop: 28,
        padding: 16, borderRadius: 16,
        background: 'var(--bg-elevated)', border: '1px solid var(--brand-primary)',
        textDecoration: 'none',
      }}
    >
      {product.images[0] && (
        <img
          src={product.images[0]}
          alt={product.nameRu}
          style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--brand-primary)' }}>
          Из этого материала
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
          {product.nameRu}
        </div>
        {price && (
          <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 2 }}>{price}</div>
        )}
      </div>
      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--brand-primary)', whiteSpace: 'nowrap' }}>
        В каталог →
      </span>
    </Link>
  );
}
