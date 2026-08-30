// Формы номера и материала журнала — общие для списков и редакторов.

export interface MagazineIssue {
  id: string;
  number: number;
  slug: string;
  titleRu: string;
  titleUz: string | null;
  summaryRu: string | null;
  summaryUz: string | null;
  coverImage: string | null;
  webUrl: string | null;
  pdfUrl: string | null;
  topics: string[];
  restaurantId: string | null;
  isPublished: boolean;
  restaurant?: { name: string | null } | null;
  _count?: { articles: number; printOrders: number };
}

export interface MagazineArticleSection {
  headingRu?: string | null;
  headingUz?: string | null;
  textRu: string;
  textUz?: string | null;
  image?: string | null;
}

export interface MagazineArticle {
  id: string;
  slug: string;
  rubric: string;
  titleRu: string;
  titleUz: string | null;
  excerptRu: string | null;
  excerptUz: string | null;
  coverImage: string | null;
  issueId: string | null;
  productId: string | null;
  isPublished: boolean;
  sortOrder: number;
  sections?: MagazineArticleSection[];
  issue?: { number: number } | null;
  _count?: { sections: number };
}

/** Пустой номер для формы «новый». */
export function emptyIssue(nextNumber: number): MagazineIssue {
  return {
    id: '', number: nextNumber, slug: '', titleRu: '', titleUz: '',
    summaryRu: '', summaryUz: '', coverImage: null, webUrl: '', pdfUrl: '',
    topics: [], restaurantId: null, isPublished: false,
  };
}

/** Пустой материал для формы «новый». */
export function emptyArticle(rubric: string): MagazineArticle {
  return {
    id: '', slug: '', rubric, titleRu: '', titleUz: '',
    excerptRu: '', excerptUz: '', coverImage: null,
    issueId: null, productId: null, isPublished: false, sortOrder: 0,
    sections: [{ headingRu: '', textRu: '', textUz: '' }],
  };
}
