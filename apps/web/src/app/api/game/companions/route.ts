// ════════════════════════════════════════════════════════════
// GET /api/game/companions — список разблокированных персонажей
// для Farm Simulator (Telegram Mini App).
// Коллекция хранится в localStorage, но клиент может отправить
// её серверу для валидации / синхронизации.
// POST — сохранить коллекцию (для будущей серверной синхронизации).
// ════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { CHARACTERS } from '@/lib/magazine/collection';

// Полная информация о персонаже для игры
interface CompanionDTO {
  id: string;
  name: string;
  emoji: string;
  bonusType: string;
  bonusValue: number;
  rarity: string;
  color: string;
}

function toDTO(charIds: string[]): CompanionDTO[] {
  return charIds
    .map(id => CHARACTERS.find(c => c.id === id))
    .filter((c): c is (typeof CHARACTERS)[number] => c !== undefined)
    .map(c => ({
      id: c.id,
      name: c.name,
      emoji: c.emoji,
      bonusType: c.bonusType,
      bonusValue: c.bonusValue,
      rarity: c.rarity,
      color: c.color,
    }));
}

// GET: отдаём каталог всех персонажей (игра решает на клиенте, кто разблокирован)
export async function GET() {
  const all = CHARACTERS.map(c => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    bonusType: c.bonusType,
    bonusValue: c.bonusValue,
    rarity: c.rarity,
    color: c.color,
    desc: c.desc,
  }));
  return NextResponse.json({ characters: all });
}

// POST: клиент присылает свою коллекцию, сервер возвращает валидные бонусы
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.collected)) {
    return NextResponse.json({ error: 'collected: string[] required' }, { status: 400 });
  }
  const valid = body.collected.filter((id: unknown) =>
    typeof id === 'string' && CHARACTERS.some(c => c.id === id)
  );
  return NextResponse.json({
    companions: toDTO(valid),
    totalBonus: {
      yield: valid.reduce((sum: number, id: string) => {
        const c = CHARACTERS.find(ch => ch.id === id);
        return c?.bonusType === 'yield' ? sum + c.bonusValue : sum;
      }, 0),
      speed: valid.reduce((sum: number, id: string) => {
        const c = CHARACTERS.find(ch => ch.id === id);
        return c?.bonusType === 'speed' ? sum + c.bonusValue : sum;
      }, 0),
    },
  });
}
