import { createReadStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename } from 'node:path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from './config.js';
import { HttpError } from './errors.js';

const configured = Boolean(config.S3_BUCKET && config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY && config.S3_PUBLIC_BASE_URL);
let client: S3Client | null = null;
function s3() {
  if (!configured) throw new HttpError(503, 'Production media storage is not configured. Set S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and S3_PUBLIC_BASE_URL.', 'MEDIA_STORAGE_NOT_CONFIGURED');
  if (!client) client = new S3Client({
    endpoint: config.S3_ENDPOINT || undefined,
    region: config.S3_REGION,
    forcePathStyle: Boolean(config.S3_ENDPOINT),
    credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY }
  });
  return client;
}
export function objectStorageConfigured() { return configured; }

/** Persists a validated media file and returns its public URL. Local disk is development-only. */
export async function storeUploadedMedia(localPath: string, filename: string, mimeType: string) {
  if (!configured && config.NODE_ENV === 'production') {
    await rm(localPath, { force: true });
    throw new HttpError(503, 'Publishing is paused because production object storage is not configured.', 'MEDIA_STORAGE_NOT_CONFIGURED');
  }
  if (!configured) return `${config.API_BASE_URL.replace(/\/$/, '')}/uploads/${encodeURIComponent(basename(filename))}`;
  await s3().send(new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: `media/${basename(filename)}`, Body: createReadStream(localPath), ContentType: mimeType, CacheControl: 'public, max-age=31536000, immutable' }));
  await rm(localPath, { force: true });
  return `${config.S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/media/${encodeURIComponent(basename(filename))}`;
}

/** Best-effort compensation when a media upload succeeded but its database record did not. */
export async function deleteUploadedMedia(mediaUrl: string) {
  const parsed = new URL(mediaUrl);
  const filename = basename(decodeURIComponent(parsed.pathname.split('/').pop() ?? ''));
  if (!filename || filename === '.' || filename === '..') return;
  if (configured) {
    await s3().send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: `media/${filename}` }));
    return;
  }
  const apiOrigin = new URL(config.API_BASE_URL).origin;
  if (parsed.origin === apiOrigin && parsed.pathname.startsWith('/uploads/')) {
    await rm(resolve(config.UPLOAD_DIR, filename), { force: true });
  }
}
