import { NextResponse } from 'next/server';

const WEB_OFFICE_URL = process.env.WEB_OFFICE_URL || 'http://localhost:8050';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const res = await fetch(`${WEB_OFFICE_URL}/api/department/${id}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch {
    // web_office not reachable
  }

  // Fallback mock
  return NextResponse.json({
    success: true,
    department: {
      id,
      name: id,
      bot: `${id}_bot`,
      icon: '📋',
      stats: { total: 0, done: 0, in_progress: 0, todo: 0, overdue: 0 },
      tasks: [],
    },
  });
}
