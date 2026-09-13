// Вкладки модерации гостевых фото. Вынесено из AdminGuestPhotos — чистые данные без состояния.

export type Status = 'pending' | 'approved' | 'printed' | 'rejected';

type Phrase = { ru: string; uz: string };

export const TABS: { id: Status; label: Phrase; hint: Phrase }[] = [
  {
    id: 'pending',
    label: { ru: 'На проверке', uz: 'Tekshiruvda' },
    hint: { ru: 'прислали гости, ещё не смотрели', uz: "mehmonlar yubordi, hali ko'rilmagan" },
  },
  {
    id: 'approved',
    label: { ru: 'Отобранные', uz: 'Tanlangan' },
    hint: { ru: 'пойдут в номер — их и выгружаем', uz: 'songa kiradi — shularni yuklaymiz' },
  },
  {
    id: 'printed',
    label: { ru: 'Напечатанные', uz: 'Chop etilgan' },
    hint: { ru: 'уже вышли в номере', uz: 'songa allaqachon chiqqan' },
  },
  {
    id: 'rejected',
    label: { ru: 'Отклонённые', uz: 'Rad etilgan' },
    hint: { ru: 'в печать не идут', uz: 'chopga ketmaydi' },
  },
];

export interface Photo {
  id: string;
  imageUrl: string;
  guestName: string | null;
  guestHandle: string | null;
  status: Status;
  createdAt: string;
  dish?: { nameRu: string } | null;
  restaurant?: { name: string } | null;
}
