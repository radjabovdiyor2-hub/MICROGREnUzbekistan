// ══════════════════════════════════════════════════════════════════════
// Шина изменений: кто-то что-то записал — открытые экраны узнают об этом.
//
// ЧТО ЛЕТИТ ПО ШИНЕ
//
// Только ИМЯ ТЕМЫ, которая изменилась. Не данные. Клиент, получив «products»,
// сам перезапрашивает то, что у него на экране, — и получает ровно тот срез,
// на который у него есть право и который ему нужен.
//
// Так дешевле думать и безопаснее жить: по потоку, открытому кассиру, не
// уедет чужая выручка, а кэш не может разойтись с базой из-за события,
// пришедшего не в том порядке. Событие здесь — это «сходи проверь», а не
// «вот тебе новое значение».
//
// ПОЧЕМУ ПРОЦЕССНАЯ, А НЕ REDIS
//
// `apps/web` — один контейнер `mg_web` (docker-compose.prod.yml). Пока он
// один, Set подписчиков в памяти процесса делает ровно то, что нужно, и не
// требует ни зависимости, ни сети. Появятся реплики — `publish` переедет на
// Redis pub/sub (`REDIS_URL` в контейнер уже проброшен), а места вызова
// останутся прежними: в этом и смысл отдельного модуля.
//
// ⚠️ Модуль обязан быть ОДИН на процесс. В dev Next перезагружает модули на
// каждое изменение, и новый экземпляр Set потерял бы уже открытые потоки —
// поэтому подписчики живут в globalThis, как и клиент Prisma.
// ══════════════════════════════════════════════════════════════════════

/** Что могло измениться. Клиент переводит тему в свои ключи кэша. */
export type Topic =
  | 'products'
  | 'orders'
  | 'inventory'
  | 'customers'
  | 'tasks'
  | 'bots';

export interface ChangeEvent {
  topic: Topic;
  /** Время публикации — клиенту для отбрасывания дублей при переподключении. */
  at: number;
}

type Subscriber = (event: ChangeEvent) => void;

const globalForBus = globalThis as unknown as { realtimeSubscribers?: Set<Subscriber> };
const subscribers: Set<Subscriber> = globalForBus.realtimeSubscribers ?? new Set();
globalForBus.realtimeSubscribers = subscribers;

/**
 * Сообщить всем открытым экранам, что тема изменилась.
 *
 * Вызывается из обработчиков ПОСЛЕ успешной записи. Отказ подписчика не
 * должен рушить запрос, который его вызвал: тот уже сохранил данные, и
 * ошибка доставки уведомления — не повод отвечать клиенту пятисоткой.
 */
export function publish(...topics: Topic[]): void {
  const at = Date.now();
  for (const topic of topics) {
    for (const notify of subscribers) {
      try {
        notify({ topic, at });
      } catch (err) {
        console.error('[realtime] подписчик отказал:', err);
      }
    }
  }
}

/** Подписаться. Возвращает функцию отписки — звать обязательно. */
export function subscribe(notify: Subscriber): () => void {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

/** Сколько потоков сейчас открыто — для `/api/health`. */
export function subscriberCount(): number {
  return subscribers.size;
}
