import { NextRequest, NextResponse } from 'next/server';

// ══════════════════════════════════════════════════════════════════════
// NFT Minting for Farm Simulator (Telegram Mini App)
// Выдаёт NFT-персонажа (Агро Друзья) игроку за достижения.
// ══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { telegramId, characterId, walletAddress } = body;

    if (!telegramId || !characterId || !walletAddress) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // В будущем здесь будет логика вызова Smart Contract на TON или Polygon
    console.log(`[NFT] Minting character ${characterId} for TG user ${telegramId} to wallet ${walletAddress}`);

    // Mock успешного минта
    const mockTxHash = `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;

    return NextResponse.json({
      success: true,
      message: 'NFT character successfully minted!',
      txHash: mockTxHash,
      character: characterId,
      owner: walletAddress
    });

  } catch (error) {
    console.error('[NFT] Error during minting:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
