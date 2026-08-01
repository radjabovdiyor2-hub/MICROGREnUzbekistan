// Форма записи об обучении бота. Вынесена из AdminLearnings.

export interface BotLearningItem {
  id: number;
  bot: string;
  metric: string;
  observation: string;
  inference: string;
  adjustment: unknown; // Json из Prisma: показывается через JSON.stringify, структура плавающая
  appliedAt: string;
}
