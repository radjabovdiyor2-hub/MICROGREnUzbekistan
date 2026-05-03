import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Todo: Payme RPC (JSON-RPC 2.0) API validation
    // const { method, params, id } = body;
    
    // For now, simple mock response for testing
    console.log('Received Payme Webhook:', body);

    if (body.method === 'CheckPerformTransaction') {
      return NextResponse.json({
        result: {
          allow: true
        },
        id: body.id
      });
    }

    // Default success for other methods
    return NextResponse.json({
      result: {
        transaction: "123",
        perform_time: new Date().getTime(),
        state: 1
      },
      id: body.id
    });
  } catch (error) {
    console.error('Payme Webhook error:', error);
    return NextResponse.json({
      error: {
        code: -32504,
        message: 'System error',
        data: 'Error in request from Payme'
      },
      id: null
    }, { status: 400 });
  }
}
