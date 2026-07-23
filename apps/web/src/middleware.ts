import { NextRequest, NextResponse } from 'next/server';
import { CATEGORY_SLUGS } from '@/lib/seo/categories';

// Старые ссылки /catalog?category=<slug> склеиваем 301-редиректом на
// категорийные лендинги /catalog/<slug> — чтобы Google не видел дублей и
// перенёс накопленный вес на индексируемый URL.
// Плитки категорий в самом каталоге меняют только состояние и query не
// ставят, поэтому редирект не мешает фильтрации внутри приложения.
export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (pathname === '/catalog') {
    const cat = searchParams.get('category');
    if (cat && CATEGORY_SLUGS.includes(cat) && !searchParams.get('search')) {
      const url = req.nextUrl.clone();
      url.pathname = `/catalog/${cat}`;
      url.searchParams.delete('category');
      return NextResponse.redirect(url, 301);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/catalog'],
};
