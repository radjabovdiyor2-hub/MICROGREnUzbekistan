#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════
// Съёмщик кадра с камеры теплицы.
//
// ЧТО ДЕЛАЕТ. Раз в минуту берёт один кадр с камеры по RTSP и кладёт его
// на сайт (`POST /api/farm/frame`). Больше ничего: ни записи, ни архива,
// ни распознавания.
//
// ГДЕ ЗАПУСКАТЬ. РЯДОМ С КАМЕРОЙ, в той же сети — на любом компьютере,
// который там и так стоит. Не на сервере сайта: камера EZVIZ отдаёт RTSP
// только внутри локальной сети, наружу его нет.
//
// ПОЧЕМУ КАДР, А НЕ ПОТОК. Поток означал бы круглосуточный перегон видео
// и трафик на каждого зрителя. На стеллажах с растущей зеленью между
// кадрами не происходит ничего: снимок раз в минуту выглядит живым и
// стоит почти ничего. Захочется движения — здесь же меняется одна команда.
//
// ЧТО НУЖНО ПОСТАВИТЬ: ffmpeg (ffmpeg.org) и Node 18+.
//
// ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ (задавать в окружении, не вписывать в файл):
//   FARM_RTSP_URL  — rtsp://admin:<код проверки>@<ip камеры>:554/H.264
//                    Код проверки напечатан на наклейке камеры. В приложении
//                    EZVIZ надо ВЫКЛЮЧИТЬ шифрование видео, иначе RTSP
//                    отдаёт зашифрованный поток и ffmpeg его не откроет.
//   FARM_ENDPOINT  — https://microgreenuzbekistan.com/api/farm/frame
//   BOT_SECRET     — тот же общий секрет, что у ботов офиса.
//   FARM_EVERY_SEC — как часто снимать. По умолчанию 60.
//
// Запуск:  FARM_RTSP_URL=... FARM_ENDPOINT=... BOT_SECRET=... node scripts/farm-camera.mjs
// ══════════════════════════════════════════════════════════════════════

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const RTSP = process.env.FARM_RTSP_URL;
const ENDPOINT = process.env.FARM_ENDPOINT;
const SECRET = process.env.BOT_SECRET;
const EVERY_SEC = Number(process.env.FARM_EVERY_SEC || 60);

// Проверяем ДО первого кадра и называем каждую пропажу отдельно: «что-то
// не задано» — это полчаса поиска вслепую.
const missing = [
  !RTSP && 'FARM_RTSP_URL',
  !ENDPOINT && 'FARM_ENDPOINT',
  !SECRET && 'BOT_SECRET',
].filter(Boolean);
if (missing.length > 0) {
  console.error(`Не задано: ${missing.join(', ')}. Смотрите шапку файла.`);
  process.exit(1);
}

/**
 * Снять один кадр.
 *
 * `-rtsp_transport tcp` обязателен: по UDP кадр рвётся на любой домашней
 * сети и приходит наполовину зелёным. `-frames:v 1` — берём первый же
 * годный кадр и выходим, не открывая поток надолго.
 */
async function grab() {
  const { stdout } = await run(
    'ffmpeg',
    [
      '-loglevel', 'error',
      '-rtsp_transport', 'tcp',
      '-i', RTSP,
      '-frames:v', '1',
      '-q:v', '3',
      '-f', 'image2',
      'pipe:1',
    ],
    { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024, timeout: 30_000 },
  );
  return stdout;
}

async function send(jpeg) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', Authorization: `Bearer ${SECRET}` },
    body: jpeg,
  });
  if (!res.ok) throw new Error(`сайт ответил ${res.status}`);
}

let failures = 0;

async function tick() {
  try {
    const jpeg = await grab();
    if (!jpeg || jpeg.length === 0) throw new Error('пустой кадр');
    await send(jpeg);
    if (failures > 0) console.log(`${new Date().toISOString()} — связь восстановилась`);
    failures = 0;
  } catch (error) {
    failures += 1;
    // Шумим только первые несколько раз: камера, выключенная на ночь,
    // иначе зальёт журнал одинаковыми строками до утра. Секрет и адрес с
    // паролем в сообщение не попадают — только текст ошибки.
    if (failures <= 3) {
      console.error(`${new Date().toISOString()} — кадр не ушёл (${failures}): ${error.message}`);
    } else if (failures % 60 === 0) {
      console.error(`${new Date().toISOString()} — кадр не уходит уже ${failures} раз подряд`);
    }
  }
}

console.log(`Съёмка каждые ${EVERY_SEC} с. Остановить — Ctrl+C.`);
await tick();
setInterval(() => { void tick(); }, EVERY_SEC * 1000);
