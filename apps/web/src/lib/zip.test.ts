import { describe, it, expect } from 'vitest';
import { createZip, crc32, zipSafeName } from './zip';

// Разбираем архив обратно по спецификации — так проверяем, что заголовки и
// смещения реальные, а не «выглядят похоже».
function readZip(buf: Buffer) {
  const eocdSig = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === eocdSig) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('EOCD не найден');
  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);

  const files: { name: string; data: Buffer; crcOk: boolean }[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('битая запись каталога');
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');

    if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('битый локальный заголовок');
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(dataStart, dataStart + size);

    files.push({ name, data: Buffer.from(data), crcOk: crc32(Buffer.from(data)) === crc });
    p += 46 + nameLen;
  }
  return files;
}

describe('lib/zip · createZip', () => {
  it('архив из двух файлов распаковывается обратно с верным CRC', () => {
    const entries = [
      { name: 'captions.txt', data: Buffer.from('первый — Диёр — Лагман\n', 'utf8') },
      { name: 'guest-1.jpg', data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]) },
    ];
    const files = readZip(createZip(entries));

    expect(files.map((f) => f.name)).toEqual(['captions.txt', 'guest-1.jpg']);
    expect(files.every((f) => f.crcOk)).toBe(true);
    expect(files[0].data.toString('utf8')).toContain('Диёр');
    expect(files[1].data).toEqual(entries[1].data);
  });

  it('начинается с сигнатуры PK\\x03\\x04', () => {
    const buf = createZip([{ name: 'a.txt', data: Buffer.from('x') }]);
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it('пустой архив валиден', () => {
    const buf = createZip([]);
    expect(readZip(buf)).toEqual([]);
  });

  it('кириллица в именах переживает round-trip (флаг UTF-8)', () => {
    const files = readZip(createZip([{ name: 'подписи.txt', data: Buffer.from('ok') }]));
    expect(files[0].name).toBe('подписи.txt');
  });
});

describe('lib/zip · crc32', () => {
  it('совпадает с эталонным значением', () => {
    // CRC32("123456789") = 0xCBF43926 — стандартный контрольный вектор
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });
});

describe('lib/zip · zipSafeName', () => {
  it('вычищает недопустимые символы', () => {
    expect(zipSafeName('a/b:c*d?.jpg')).toBe('a-b-c-d-.jpg');
    expect(zipSafeName('///')).toBe('file');
  });
});
