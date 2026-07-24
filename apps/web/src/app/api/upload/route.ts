import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import { getUploadsDir } from '@/lib/uploads';

// ==========================================
// Upload API — file upload for products, magazine media, and PDFs
// Supports large files up to 100MB
// Validates by file extension (not MIME — mobile browsers unreliable)
//
// Директория загрузки — общий помощник lib/uploads.ts
// ==========================================

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 100 * 1024 * 1024) {
      return NextResponse.json({ error: 'Fayl hajmi 100MB dan oshmasin' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Fayl tanlanmagan' }, { status: 400 });
    }

    // Validate by file extension — MIME types from mobile browsers are unreliable
    const ext = (file.name || '').split('.').pop()?.toLowerCase() || '';
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'heif', 'gif', 'bmp', 'tiff', 'tif', 'svg', 'pdf', 'html', 'htm'];

    const videoExtensions = ['mp4', 'webm', 'mov'];
    const videoMimes = ['video/mp4', 'video/webm', 'video/quicktime'];

    // Also check MIME as fallback (but don't reject if extension is valid)
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic',
      'image/heif', 'image/gif', 'image/bmp', 'image/tiff', 'image/svg+xml',
      'application/pdf', 'text/html',
      'application/octet-stream',
    ];

    // Видео определяем по расширению, а не по MIME: комментарий выше не зря —
    // телефоны шлют octet-stream, и по MIME ролик не отличить от картинки.
    const isVideo = videoExtensions.includes(ext);
    const extValid = allowedExtensions.includes(ext) || isVideo;
    const mimeValid = allowedMimes.includes(file.type) || videoMimes.includes(file.type);

    if (!extValid && !mimeValid) {
      return NextResponse.json({
        error: `Format qo'llab-quvvatlanmaydi. Fayl: ${file.name}, Tur: ${file.type}`,
      }, { status: 400 });
    }

    // Единый лимит 100MB для всех типов файлов
    const maxMB = 100;
    if (file.size > maxMB * 1024 * 1024) {
      const actual = (file.size / 1024 / 1024).toFixed(1);
      return NextResponse.json({
        error: `Fayl hajmi juda katta: ${actual}MB (max ${maxMB}MB)`,
      }, { status: 400 });
    }

    // Generate unique filename — preserve original extension
    const safeExt = extValid ? ext : 'jpg';
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
