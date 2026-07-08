import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readlink, stat } from 'fs/promises';
import path from 'path';

// ==========================================
// Upload API — Image upload for products
// Supports large phone photos up to 50MB
// Validates by file extension (not MIME — mobile browsers unreliable)
//
// STANDALONE FIX:
// PM2 cwd = /home/ubuntu/MICROGREnUzbekistan
// Standalone serves from: apps/web/.next/standalone/apps/web/public/
// Upload writes to the PERSISTENT dir (/home/ubuntu/microgreen-uploads)
// which is symlinked into standalone/public/uploads/
// ==========================================

export const runtime = 'nodejs';

// Find the correct uploads directory for the current environment
async function getUploadsDir(): Promise<string> {
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

  // 2. Try standalone public/uploads (standalone mode)
  const standaloneDir = path.resolve(process.cwd(), 'apps/web/.next/standalone/apps/web/public/uploads');
  try {
    await mkdir(standaloneDir, { recursive: true });
    return standaloneDir;
  } catch {
    // Not available
  }

  // 3. Fallback: local development — use public/uploads relative to this file's context
  const localDir = path.join(process.cwd(), 'public', 'uploads');
  await mkdir(localDir, { recursive: true });
  return localDir;
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'Fayl hajmi 50MB dan oshmasin' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Fayl tanlanmagan' }, { status: 400 });
    }

    // Validate by file extension — MIME types from mobile browsers are unreliable
    const ext = (file.name || '').split('.').pop()?.toLowerCase() || '';
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'heif', 'gif', 'bmp', 'tiff', 'tif', 'svg'];

    // Also check MIME as fallback (but don't reject if extension is valid)
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic',
      'image/heif', 'image/gif', 'image/bmp', 'image/tiff', 'image/svg+xml',
      'application/octet-stream', // Some phones send this
    ];

    const extValid = allowedExtensions.includes(ext);
    const mimeValid = allowedMimes.includes(file.type);

    if (!extValid && !mimeValid) {
      return NextResponse.json({
        error: `Rasm formati qo'llab-quvvatlanmaydi. Fayl: ${file.name}, Tur: ${file.type}`,
      }, { status: 400 });
    }

    // Max 50MB
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: `Fayl hajmi juda katta: ${(file.size / 1024 / 1024).toFixed(1)}MB (max 50MB)` }, { status: 400 });
    }

    // Generate unique filename — preserve original extension
    const safeExt = allowedExtensions.includes(ext) ? ext : 'jpg';
    const timestamp = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 6);
    const filename = `product-${timestamp}-${rand}.${safeExt}`;

    // Get the correct uploads directory
    const uploadsDir = await getUploadsDir();

    // Write file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filepath = path.join(uploadsDir, filename);
    await writeFile(filepath, buffer);

    const url = `/uploads/${filename}`;
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);

    console.log(`[Upload] Saved: ${filepath} (${sizeMB}MB) → ${url}`);

    return NextResponse.json({
      success: true,
      url,
      filename,
      size: file.size,
      sizeMB: `${sizeMB} MB`,
    });
  } catch (error) {
    console.error('Upload error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Yuklashda xatolik: ${msg}` }, { status: 500 });
  }
}
