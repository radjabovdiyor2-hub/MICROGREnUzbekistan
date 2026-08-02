import { NextRequest, NextResponse } from 'next/server';

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'microgreen_uz_wa_token_stub';

export async function GET(request: NextRequest) {
  // Webhook verification by Meta (WhatsApp)
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode && token) {
    if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
      console.log('WhatsApp Webhook verified!');
      // Return the challenge as plain text
      return new NextResponse(challenge, { status: 200 });
    }
  }

  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Check if it's a WhatsApp status update or message
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages') {
            const value = change.value;

            // Log messages (to be forwarded to Support Bot)
            if (value.messages && value.messages.length > 0) {
              const message = value.messages[0];
              const phone = value.contacts[0].wa_id;
              
              console.log(`[WhatsApp] New message from ${phone}: ${message.text?.body || 'Attachment'}`);

              // Future: Event bus publish to 'support' bot for processing
              // await event_bus.publish('whatsapp_message', { phone, message });
            }
          }
        }
      }
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    return new NextResponse('Not Found', { status: 404 });
  } catch (error) {
    console.error('WhatsApp Webhook error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
