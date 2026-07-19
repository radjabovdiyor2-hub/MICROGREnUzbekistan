export interface MagazineIssue {
  id: number;
  title: string;
  date: string;
  cover: string;
  highlights: { icon: string; label: string }[];
  pdfUrl?: string;
  contentHtml?: string;
  arEnabled?: boolean;
}

export const ISSUES: MagazineIssue[] = [
  {
    id: 2,
    title: 'Стрит-фуд, Пибимпаб и Азиатские тренды',
    date: 'Декабрь 2023',
    cover: '/magazine/cover_issue_02.png',
    highlights: [
      { icon: '🍜', label: 'Корейский стрит-фуд' },
      { icon: '🥩', label: 'Пибимпаб с микрозеленью' },
      { icon: '🌶', label: 'Острые азиатские вкусы' },
      { icon: '🌱', label: 'Дайкон и кинза в деле' },
    ],
    pdfUrl: '/magazine/fresh_weekly_02.pdf',
  },
  {
    id: 1,
    title: 'Сладкое + Острое: новая эра вкуса',
    date: 'Ноябрь 2023',
    cover: '/magazine/cover-01.png',
    highlights: [
      { icon: '🍽', label: 'ORA — Ресторан недели' },
      { icon: '🌍', label: 'Нон-кабоб: стрит-фуд мира' },
      { icon: '🍰', label: 'Чизкейк «Цветочный сад»' },
      { icon: '🎨', label: 'Hot Honey: мёд + чили' },
    ],
    pdfUrl: '/magazine/fresh_weekly_01.pdf',
  },
];
