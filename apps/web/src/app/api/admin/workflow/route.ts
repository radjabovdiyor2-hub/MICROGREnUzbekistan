import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const TGAS_OFFICE_URL = process.env.TGAS_OFFICE_URL || 'http://localhost:8050';
    const response = await fetch(`${TGAS_OFFICE_URL}/api/workflow/state`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Office API returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error fetching workflow state:', error);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
