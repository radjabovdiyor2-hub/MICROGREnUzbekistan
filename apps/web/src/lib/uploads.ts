import { mkdir, stat, writeFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

// ==========================================
// Куда писать загруженные файлы.
// Логика вынесена из /api/upload, потому что кадры гостей «Живого меню»
// пишутся тем же способом, а два разных пути записи разъедутся на проде.
//
// STANDALONE FIX:
// PM2 cwd = /home/ubuntu/MICROGREnUzbekistan
// Standalone serves from: apps/web/.next/standalone/apps/web/public/
// Upload writes to the PERSISTENT dir (/home/ubuntu/microgreen-uploads)
// which is symlinked into standalone/public/uploads/
// ==========================================
export async function getUploadsDir(): Promise<string> {
  // 1. Try persistent uploads directory (production). In Docker this is the
  //    mounted volume (UPLOADS_DIR=/data/uploads); on bare metal the host dir.
  const persistentDir = process.env.UPLOADS_DIR || '/home/ubuntu/microgreen-uploads';
  try {
    const s = await stat(persistentDir);
    if (s.isDirectory()) {
      return persistentDir;
    }
  } catch {
    // Not on production server
  }

  // 2. Standalone public/uploads — только если каталог УЖЕ есть.
  //    Раньше здесь стоял mkdir -p, и в локальной разработке (cwd = apps/web)
  //    он молча создавал apps/web/apps/web/.next/... — загрузки уезжали туда
  //    и не отдавались по /uploads/. Существование каталога и есть признак
  //    standalone-режима, поэтому проверяем, а не создаём.
  const standaloneDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), 'apps/web/.next/standalone/apps/web/public/uploads');
  try {
    const s = await stat(standaloneDir);
    if (s.isDirectory()) return standaloneDir;
  } catch {
    // Not in standalone mode
  }

  // 3. Fallback: local development — use public/uploads relative to this file's context
  const localDir = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'uploads');
  await mkdir(localDir, { recursive: true });
  return localDir;
}

/** Записывает буфер в uploads и возвращает публичный URL. */
export async function saveUpload(buffer: Buffer, prefix: string, ext = 'jpg'): Promise<string> {
  const timestamp = Date.now().toString(36);
  const rand = crypto.randomBytes(8).toString('hex');
  const filename = `${prefix}-${timestamp}-${rand}.${ext}`;
  const dir = await getUploadsDir();
  await writeFile(path.join(dir, filename), buffer);
  return `/uploads/${filename}`;
}
