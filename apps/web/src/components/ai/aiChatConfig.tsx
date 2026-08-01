import type { ReactNode } from 'react';
import { Calculator, Camera, Leaf, Phone } from 'lucide-react';

// Типы и данные ИИ-чата, общие для виджета и его частей.
// Вынесено из AiChatWidget: файл перерос 200 строк.

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  timestamp: number;
}

export type ChatMode = 'chat' | 'tools';

export type QuickActionId = 'photo' | 'care' | 'calc' | 'call';

// Быстрые действия. Раньше массив собирался внутри компонента вместе с
// обработчиками, которые дёргали ref, — и ссылка на ref попадала в структуру,
// создаваемую во время рендера. Теперь здесь только данные; что делает
// кнопка, решает runQuickAction уже в момент клика.
export const QUICK_ACTIONS: { id: QuickActionId; icon: ReactNode; label: string; color: string }[] = [
  { id: 'photo', icon: <Camera size={18} />, label: 'Foto tahlil', color: 'var(--cat-2)' },
  { id: 'care', icon: <Leaf size={18} />, label: 'Parvarish', color: 'var(--brand-primary)' },
  { id: 'calc', icon: <Calculator size={18} />, label: 'Kalkulyator', color: 'var(--info)' },
  { id: 'call', icon: <Phone size={18} />, label: "Qo'ng'iroq", color: 'var(--brand-primary)' },
];
