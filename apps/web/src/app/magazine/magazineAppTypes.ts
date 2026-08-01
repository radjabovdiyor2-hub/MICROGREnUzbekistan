export interface PublishedIssue {
  slug: string;
  weekNumber: number;
  restaurantName: string;
  restaurantCity?: string | null;
  brandPrimary?: string | null;
  title: string;
}
