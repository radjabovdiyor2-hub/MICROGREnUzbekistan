// ════════════════════════════════════════════════════════════
// Минимальный ZIP-архиватор без сжатия (метод 0, «store»).
//
// Нужен, чтобы отдавать кадры гостей одним файлом для внешней вёрстки.
// Ради этого не тянем новую зависимость: фото уже сжаты как JPEG, повторный
// deflate ничего не выигрывает, а store-контейнер понимают все распаковщики,
// включая Проводник Windows.
//
// Формат: PKZIP APPNOTE — локальный заголовок на каждый файл, центральный
// каталог в конце, затем EOCD.
// ════════════════════════════════════════════════════════════

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Buffer;
}

// Дата/время в формате MS-DOS — обязательное поле заголовка.
function dosDateTime(d: Date): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2));
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/** Собирает ZIP из списка файлов. Имена — UTF-8 (выставляем флаг bit 11). */
export function createZip(entries: ZipEntry[], now = new Date()): Buffer {
  const { time, date } = dosDateTime(now);
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // сигнатура локального заголовка
    local.writeUInt16LE(20, 4);           // версия для распаковки
    local.writeUInt16LE(0x0800, 6);       // флаги: имя в UTF-8
    local.writeUInt16LE(0, 8);            // метод 0 — без сжатия
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);        // сжатый размер
    local.writeUInt32LE(size, 22);        // исходный размер
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);           // extra field
    chunks.push(local, nameBuf, entry.data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);      // сигнатура записи центрального каталога
    cd.writeUInt16LE(20, 4);              // версия создателя
    cd.writeUInt16LE(20, 6);              // версия для распаковки
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(size, 20);
    cd.writeUInt32LE(size, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);              // extra
    cd.writeUInt16LE(0, 32);              // comment
    cd.writeUInt16LE(0, 34);              // номер диска
    cd.writeUInt16LE(0, 36);              // внутренние атрибуты
    cd.writeUInt32LE(0, 38);              // внешние атрибуты
    cd.writeUInt32LE(offset, 42);         // смещение локального заголовка
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + size;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);      // сигнатура EOCD
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);         // смещение центрального каталога
  eocd.writeUInt16LE(0, 20);              // комментарий архива

  return Buffer.concat([...chunks, centralBuf, eocd]);
}

/** Имя файла, безопасное для архива и любой ФС. */
export function zipSafeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
}
