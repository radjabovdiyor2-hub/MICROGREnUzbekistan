import { NextResponse } from 'next/server';

const WEB_OFFICE_URL = process.env.WEB_OFFICE_URL || 'http://localhost:8050';

// Fallback mock data when web_office is unreachable
const MOCK_DEPARTMENTS = [
  { id: 'marketing', name: 'Маркетинг', bot: 'MG_Marketing_bot', icon: '📢', status: 'unknown', tasks_total: 0, tasks_done: 0, tasks_in_progress: 0, tasks_todo: 0 },
  { id: 'content', name: 'Контент', bot: 'MG_Content1_bot', icon: '✍️', status: 'unknown', tasks_total: 0, tasks_done: 0, tasks_in_progress: 0, tasks_todo: 0 },
  { id: 'hr', name: 'Кадры (HR)', bot: 'MG_HR1_bot', icon: '👥', status: 'unknown', tasks_total: 0, tasks_done: 0, tasks_in_progress: 0, tasks_todo: 0 },
  { id: 'finance', name: 'Финансы', bot: 'MG_Finance1_bot', icon: '💰', status: 'unknown', tasks_total: 0, tasks_done: 0, tasks_in_progress: 0, tasks_todo: 0 },
  { id: 'devops', name: 'DevOps / IT', bot: 'MG_PM1_bot', icon: '⚙️', status: 'unknown', tasks_total: 0, tasks_done: 0, tasks_in_progress: 0, tasks_todo: 0 },
  { id: 'qa', name: 'QA / Тесты', bot: 'MG_PM1_bot', icon: '🔍', status: 'unknown', tasks_total: 0, tasks_done: 0, tasks_in_progress: 0, tasks_todo: 0 },
  { id: 'rnd', name: 'R&D', bot: 'MG_PM1_bot', icon: '💡', status: 'unknown', tasks_total: 0, tasks_done: 0, tasks_in_progress: 0, tasks_todo: 0 },
  { id: 'support', name: 'Поддержка', bot: 'MicrogreenSupport_bot', icon: '🎧', status: 'unknown', tasks_total: 0, tasks_done: 0, tasks_in_progress: 0, tasks_todo: 0 },
  { id: 'sales', name: 'Продажи', bot: 'MicrogreenSales_bot', icon: '🛒', status: 'unknown', tasks_total: 0, tasks_done: 0, tasks_in_progress: 0, tasks_todo: 0 },
  { id: 'analytics', name: 'Аналитика', bot: 'MG_Analytics_bot', icon: '📊', status: 'unknown', tasks_total: 0, tasks_done: 0, tasks_in_progress: 0, tasks_todo: 0 },
];

export async function GET() {
  try {
    const res = await fetch(`${WEB_OFFICE_URL}/api/departments/summary`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch {
    // web_office not reachable — use fallback
  }
  return NextResponse.json({ success: true, departments: MOCK_DEPARTMENTS });
}
