import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// ══════════════════════════════════════════════════════════════════════
// Справочник заведений Самаркандской области → лиды в `customers`.
//
// Читает ВЫГРУЗКУ, а не написанный руками список. Способов два:
//
//   1. Сбор через API провайдеров (нужны ключи):
//        cd apps/tgas && python -m scripts.collect_restaurants \
//            --source api --all-categories --all-places \
//            --out ../../content/venues-samarkand.json
//
//   2. Открытые справочники — то, чем файл наполнен СЕЙЧАС: goldenpages.uz
//      (рубрики Самарканда 3475 / 108609 / 109347), top.uz (restorany и
//      gostinitsy), samcity.uz. Это 211 заведений, и у каждого в `source`
//      стоит его настоящий справочник — ни одно не выдаётся за 2ГИС.
//
// Файл лежит в репозитории, чтобы наполнить базу можно было без ключей к
// 2ГИС/Google/Яндексу — например на новой машине или на стенде. Данные в
// нём настоящие: имена и адреса прочитаны на страницах справочников.
// Телефонов нет вовсе — все три справочника их маскируют, а дописать
// недостающие цифры значит выдумать номер. Выдуманной карточки здесь быть
// не должно: она хуже пустой карты, потому что по ней поедут.
//
// Идемпотентность по ключу (source, source_ref). Уникального индекса на
// эту пару в схеме нет намеренно: он бы упал на `db push`, если в живой
// базе уже завелись дубли, — поэтому сверка идёт выборкой в память, тем
// же приёмом, что в `shared/lead_gen.py::import_leads`.
//
// Что скрипт НЕ трогает ни при каких условиях:
//   • `geo_source = 'manual'`   — координату, поставленную человеком;
//   • `audience_source='manual'` — пол зала, выясненный продавцом;
//   • `status`                   — он монотонен, и понижать active/vip до
//                                  lead повторным прогоном нельзя.
//
// Запуск:  npm run db:seed:venues            (из packages/database)
//          npx tsx prisma/seed-venues.ts --file ../../content/other.json
// ══════════════════════════════════════════════════════════════════════

const prisma = new PrismaClient();

/** Карточка в том виде, в каком её отдаёт `collect_venues`. */
interface VenueLead {
  company_name: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  review_score?: number | null;
  review_summary?: string | null;
  source?: string | null;
  source_ref?: string | null;
  company_type?: string | null;
  audience?: string | null;
  audience_source?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geo_precision?: string | null;
}

/**
 * Ключ идемпотентности: источник + его идентификатор записи.
 *
 * Разделитель — «::». Не пробел и не NUL: NUL в исходнике делал файл
 * бинарным для git, и весь сидер выпадал из `git diff` и из ревью. Ни один
 * из четырёх источников («2gis», «google_places», «yandex_maps», «manual»)
 * двоеточий не содержит, поэтому склейка остаётся однозначной.
 */
function refKey(source: string | null, ref: string | null): string {
  return `${source}::${ref}`;
}

/** Границы Узбекистана с запасом — тот же предохранитель, что в lead_gen. */
const UZ = { minLat: 37, maxLat: 46, minLon: 55, maxLon: 74 };

/**
 * Пара чисел внутри страны — иначе null.
 *
 * Перепутанные местами широта и долгота формально валидны в обе стороны и
 * потому не падают, а тихо уносят точку в Индийский океан. Ловит только
 * привязка к стране.
 */
function validPoint(lat: unknown, lon: unknown): { lat: number; lon: number } | null {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (la < UZ.minLat || la > UZ.maxLat) return null;
  if (lo < UZ.minLon || lo > UZ.maxLon) return null;
  return { lat: la, lon: lo };
}

function argValue(flag: string): string | undefined {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

async function main(): Promise<void> {
  const file = path.resolve(
    __dirname,
    argValue('--file') ?? '../../../content/venues-samarkand.json',
  );

  if (!fs.existsSync(file)) {
    // Молча выходить нельзя: «сид отработал, клиентов нет» — самый дорогой
    // вид тишины. Но и падать нельзя: сидер вызывается из seed-if-empty.ts
    // на КАЖДОМ деплое, а execSync там роняет весь засев — вместе с импортом
    // каталога, который к заведениям отношения не имеет. Поэтому громкое
    // предупреждение и выход с нулём.
    console.warn(
      `Файл выгрузки не найден: ${file}`,
    );
    console.warn(
      'Справочник заведений НЕ засеян. Собрать его: cd apps/tgas && ' +
        'python -m scripts.collect_restaurants --source api ' +
        '--all-categories --all-places --out ../../content/venues-samarkand.json',
    );
    return;
  }

  const leads = JSON.parse(fs.readFileSync(file, 'utf-8')) as VenueLead[];
  if (!Array.isArray(leads)) {
    throw new Error('Ожидался массив карточек заведений');
  }
  console.log(`Прочитано карточек: ${leads.length}`);

  // Один запрос вместо N: пачка бывает в тысячи строк.
  const existing = await prisma.customer.findMany({
    where: { source: { not: null }, sourceRef: { not: null } },
    select: {
      id: true,
      source: true,
      sourceRef: true,
      geoSource: true,
      audienceSource: true,
    },
  });
  const byRef = new Map(existing.map((c) => [refKey(c.source, c.sourceRef), c]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const lead of leads) {
    const name = (lead.company_name ?? '').trim();
    if (!name || !lead.source || !lead.source_ref) {
      skipped += 1;
      continue;
    }

    const point = validPoint(lead.latitude, lead.longitude);
    const known = byRef.get(refKey(lead.source, lead.source_ref));

    // Координаты: ручной пин не перезаписываем никогда. Тот же инвариант
    // держат и геокодер, и сборщик — он и делает карту предсказуемой.
    const geo =
      point && known?.geoSource !== 'manual'
        ? {
            latitude: point.lat,
            longitude: point.lon,
            geoSource: lead.source,
            geoPrecision: lead.geo_precision ?? 'exact',
            geoAddress: lead.address ?? null,
            geocodedAt: new Date(),
          }
        : {};

    // Аудитория: выясненное человеком важнее догадки по названию.
    const audience =
      lead.audience && known?.audienceSource !== 'manual'
        ? { audience: lead.audience, audienceSource: lead.audience_source ?? 'guess' }
        : {};

    if (known) {
      await prisma.customer.update({
        where: { id: known.id },
        data: {
          companyName: name,
          phone: lead.phone ?? undefined,
          email: lead.email ?? undefined,
          address: lead.address ?? undefined,
          city: lead.city ?? undefined,
          district: lead.district ?? undefined,
          companyType: lead.company_type ?? undefined,
          reviewScore: lead.review_score ?? undefined,
          reviewSummary: lead.review_summary ?? undefined,
          // `status` не трогаем: он монотонен, и повторный прогон не должен
          // разжаловать активного клиента обратно в лид.
          ...geo,
          ...audience,
        },
      });
      updated += 1;
      continue;
    }

    const row = await prisma.customer.create({
      data: {
        name,
        companyName: name,
        phone: lead.phone ?? null,
        email: lead.email ?? null,
        address: lead.address ?? null,
        city: lead.city ?? 'Samarqand',
        district: lead.district ?? null,
        customerType: 'b2b',
        companyType: lead.company_type ?? 'other',
        status: 'lead',
        source: lead.source,
        sourceRef: lead.source_ref,
        reviewScore: lead.review_score ?? null,
        reviewSummary: lead.review_summary ?? null,
        ...geo,
        ...audience,
      },
      select: { id: true, source: true, sourceRef: true, geoSource: true, audienceSource: true },
    });
    // Внутри одной пачки провайдер повторяет карточку между запросами
    // («ресторан» и «restoran» находят одно и то же), поэтому индекс
    // пополняем на ходу.
    byRef.set(refKey(row.source, row.sourceRef), row);
    created += 1;
  }

  console.log(`Заведено: ${created}, обновлено: ${updated}, пропущено: ${skipped}`);
  console.log('Точки без координат разложит геокодер офиса (shared/geo.py::geocode_pass).');
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
