import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Todo: Click API signature validation
    // const { click_trans_id, service_id, click_paydoc_id, merchant_trans_id, amount, action, error, error_note, sign_time, sign_string } = body;
    
    // For now, simple mock response for testing
    console.log('Received Click Webhook:', body);

    return NextResponse.json({
      error: 0,
      error_note: "Success",
      click_trans_id: body.click_trans_id || 0,
      merchant_trans_id: body.merchant_trans_id || "0",
      merchant_prepare_id: body.action === 0 ? Math.floor(Math.random() * 100000) : undefined,
      merchant_confirm_id: body.action === 1 ? Math.floor(Math.random() * 100000) : undefined
    });
  } catch (error) {
    console.error('Click Webhook error:', error);
    return NextResponse.json({ error: -8, error_note: 'Error in request from click' }, { status: 400 });
  }
}
