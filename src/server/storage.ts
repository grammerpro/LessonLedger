import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { config } from './config';
import { db, id, now, encode, tenantRow } from './db';
const s3 = () =>
  new S3Client({
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION || 'us-east-1',
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
  });
export async function putBlob(workspace: string, bytes: Buffer, contentType: string) {
  const blobId = id();
  const key = `${workspace}/${blobId}`;
  if (config.demo) {
    const dir = join(config.dataDir, 'blobs', workspace);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, blobId), bytes, { mode: 0o600 });
  } else
    await s3().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    );
  await db('blobs').insert({
    id: blobId,
    workspace_id: workspace,
    created_at: now(),
    payload: encode({ key, contentType, size: bytes.length }),
  });
  return blobId;
}
export async function getBlob(workspace: string, blobId: string) {
  const blob = await tenantRow('blobs', blobId, workspace);
  const bytes = config.demo
    ? await readFile(join(config.dataDir, 'blobs', workspace, blobId))
    : Buffer.from(
        await (
          await s3().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: blob.key }))
        ).Body!.transformToByteArray(),
      );
  return { bytes, contentType: blob.contentType };
}
export async function deleteBlob(workspace: string, blobId: string) {
  const blob = await tenantRow('blobs', blobId, workspace);
  if (config.demo)
    await unlink(join(config.dataDir, 'blobs', workspace, blobId)).catch(
      (e: NodeJS.ErrnoException) => {
        if (e.code !== 'ENOENT') throw e;
      },
    );
  else await s3().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: blob.key }));
  await db('blobs').where({ id: blobId, workspace_id: workspace }).delete();
}
