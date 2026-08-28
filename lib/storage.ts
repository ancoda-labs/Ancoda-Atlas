// MinIO object storage for flood ground-report photos.
//
// Mirrors the storage service in Danta-Med: one bucket, keys namespaced by
// resource, and pre-signed GET URLs generated on demand and never persisted.
// The database stores the object key; the URL that serves it is short-lived, so
// a leaked row from a backup is not a permanent public link to the bytes.
//
// SCOPE — read this before adding a caller.
//
// This bucket holds photographs uploaded by members of the public, and nothing
// else. It is not a cache and not a mirror. Third-party material — news
// photographs, video thumbnails, satellite imagery, anything Atlas did not
// receive directly from the person who took it — is served by streaming it
// through lib/news-media.ts at request time and is never written here. Keeping
// that line sharp is what makes the bucket's contents describable in one
// sentence: it is the community's own photographs, and each one can be deleted
// on the word of the person who sent it.
//
// Keys follow:  flood-photos/{yyyy-mm-dd}/{id}.{ext}

import { Client } from 'minio';
import { errorMessage } from './types';

interface AtlasStorageGlobal {
  __atlasMinio?: Client;
  __atlasMinioPublic?: Client;
  __atlasBucketReady?: Promise<void>;
}

const g = globalThis as unknown as AtlasStorageGlobal;

export const BUCKET = process.env.MINIO_BUCKET || 'atlas';

const PRESIGNED_EXPIRY_SECONDS = Number(process.env.MINIO_PRESIGNED_EXPIRY_SECONDS) || 3600;

export function isStorageConfigured(): boolean {
  return Boolean(process.env.MINIO_ENDPOINT && process.env.MINIO_ROOT_USER && process.env.MINIO_ROOT_PASSWORD);
}

/**
 * Split a `host` or `host:port` endpoint the way the Python SDK accepts it into
 * the separate endPoint/port the JavaScript SDK wants.
 */
function splitEndpoint(endpoint: string, secure: boolean): { endPoint: string; port: number } {
  const [host, port] = endpoint.replace(/^https?:\/\//, '').split(':');
  return {
    endPoint: host || 'localhost',
    port: port ? Number(port) : secure ? 443 : 80,
  };
}

function build(endpoint: string): Client {
  const secure = process.env.MINIO_SECURE !== 'false';
  const { endPoint, port } = splitEndpoint(endpoint, secure);
  return new Client({
    endPoint,
    port,
    useSSL: secure,
    accessKey: process.env.MINIO_ROOT_USER || '',
    secretKey: process.env.MINIO_ROOT_PASSWORD || '',
    region: process.env.MINIO_REGION || 'us-east-1',
  });
}

function client(): Client {
  if (!isStorageConfigured()) throw new Error('MinIO is not configured');
  if (!g.__atlasMinio) g.__atlasMinio = build(process.env.MINIO_ENDPOINT || '');
  return g.__atlasMinio;
}

/**
 * The client used to sign URLs a browser will follow. Inside Docker the server
 * reaches MinIO at `minio:9000`, which means nothing to a phone on the internet
 * — so signatures for public links are produced against the public hostname.
 */
function publicClient(): Client {
  const publicEndpoint = process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || '';
  if (publicEndpoint === (process.env.MINIO_ENDPOINT || '')) return client();
  if (!g.__atlasMinioPublic) g.__atlasMinioPublic = build(publicEndpoint);
  return g.__atlasMinioPublic;
}

/** Create the bucket if it is missing. Memoised per process. */
export function ensureBucket(): Promise<void> {
  if (!g.__atlasBucketReady) {
    g.__atlasBucketReady = (async () => {
      const c = client();
      if (!(await c.bucketExists(BUCKET))) {
        await c.makeBucket(BUCKET, process.env.MINIO_REGION || 'us-east-1');
        console.log(`[Storage] Created bucket ${BUCKET}`);
      }
    })().catch(err => {
      g.__atlasBucketReady = undefined;
      throw err;
    });
  }
  return g.__atlasBucketReady;
}

export async function upload(key: string, data: Buffer, contentType: string): Promise<string> {
  await ensureBucket();
  await client().putObject(BUCKET, key, data, data.length, { 'Content-Type': contentType });
  return key;
}

/** A time-limited URL a browser can load the object from. */
export async function presignedGetUrl(key: string): Promise<string> {
  return publicClient().presignedUrl('GET', BUCKET, key, PRESIGNED_EXPIRY_SECONDS);
}

export async function remove(key: string): Promise<void> {
  try {
    await client().removeObject(BUCKET, key);
  } catch (err) {
    // A missing object is not worth failing a takedown over — the row is the
    // thing that makes a photo visible, and the caller has already cleared it.
    console.warn(`[Storage] Delete failed for ${key}:`, errorMessage(err));
  }
}

/** Read an object back. Used by the image proxy when MinIO is not public. */
export async function download(key: string): Promise<Buffer> {
  const stream = await client().getObject(BUCKET, key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function storageHealthy(): Promise<boolean> {
  if (!isStorageConfigured()) return false;
  try {
    await client().bucketExists(BUCKET);
    return true;
  } catch (err) {
    console.error('[Storage] Health check failed:', errorMessage(err));
    return false;
  }
}

/** Object key for one photo, partitioned by day so the bucket stays browsable. */
export function photoKey(id: string, ext: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `flood-photos/${day}/${id}.${ext}`;
}
