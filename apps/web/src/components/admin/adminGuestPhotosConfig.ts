// Вкладки модерации гостевых фото. Вынесено из AdminGuestPhotos — чистые данные без состояния.

export type Status = 'pending' | 'approved' | 'printed' | 'rejected';

export const TABS: { id: Status; label: string; hint: string }[] = [
  { id: 'pending', label: 'На проверке', hint: 'прислали гости, ещё не смотрели' },
  { id: 'approved', label: 'Отобранные', hint: 'пойдут в номер — их и выгружаем' },
  { id: 'printed', label: 'Напечатанные', hint: 'уже вышли в номере' },
  { id: 'rejected', label: 'Отклонённые', hint: 'в печать не идут' },
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
