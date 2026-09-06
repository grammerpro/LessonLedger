import { NextResponse } from 'next/server';
import { z } from 'zod';
import { config } from '@/server/config';
import { db, id, AppError, tenantRow, unpack } from '@/server/db';
import { context, sameOrigin, rateLimit, owner } from '@/server/context';
import {
  state,
  createCourse,
  createLesson,
  pastedLesson,
  createSource,
  review,
  settings,
  schedule,
  deleteWorkspace,
} from '@/server/services';
import { createSample } from '@/server/demo';
import { hash, parseUpload } from '@/server/parse';
import { enqueue, cancel } from '@/server/jobs';
import { putBlob, getBlob } from '@/server/storage';
import { exportWork } from '@/server/exports';
import { checkout, webhook } from '@/server/billing';
import { limits } from '@/shared/plans';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function jsonBody(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 300000)
    throw new AppError('Request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('Request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 300000) {
      await reader.cancel();
      throw new AppError('Request is too large.', 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AppError('Invalid JSON.');
  }
}
async function handler(request: Request, route: { params: Promise<{ path: string[] }> }) {
  const correlationId = id();
  try {
    const { path } = await route.params;
    const target = path.join('/');
    const method = request.method;
    if (target === 'health/live') return NextResponse.json({ status: 'ok' });
    if (target === 'health/ready') {
      await db('workspaces').select('id').limit(1);
      return NextResponse.json({ status: 'ready' });
    }
    if (target === 'billing/webhook' && method === 'POST') {
      await webhook(await request.text(), request.headers.get('stripe-signature') || '');
      return NextResponse.json({ received: true });
    }
    if (method !== 'GET') sameOrigin(request);
    if (target === 'demo' && method === 'POST') {
      if (!config.demo) throw new AppError('Sample mode is disabled.', 404);
      await rateLimit('sample-creation', 60);
      const workspace = await createSample();
      const token = crypto.randomUUID() + crypto.randomUUID();
      await db('demo_sessions').insert({
        id: hash(token),
        workspace_id: workspace,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });
      const response = NextResponse.json({ ok: true });
      response.cookies.set('ll_sample', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.url.startsWith('https:'),
        maxAge: 86400,
        path: '/',
      });
      return response;
    }
    const ctx = await context(request);
    if (method !== 'GET') await rateLimit(`${ctx.workspace}:mutations`, 120);
    if (target === 'state' && method === 'GET')
      return NextResponse.json(await state(ctx), {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    if (target === 'workspace/select' && method === 'POST') {
      const data = z.object({ id: z.string().uuid() }).parse(await jsonBody(request));
      if (
        (ctx.demo && data.id !== ctx.workspace) ||
        (!ctx.demo &&
          !(await db('memberships').where({ user_id: ctx.userId, workspace_id: data.id }).first()))
      )
        throw new AppError('Workspace unavailable.', 403);
      const response = NextResponse.json({ ok: true });
      response.cookies.set('ll_workspace', data.id, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.url.startsWith('https:'),
        path: '/',
      });
      return response;
    }
    if (target === 'logout' && method === 'POST') {
      const response = NextResponse.json({ ok: true });
      response.cookies.delete('ll_sample');
      response.cookies.delete('ll_workspace');
      return response;
    }
    if (target === 'courses' && method === 'POST')
      return NextResponse.json({ id: await createCourse(ctx, await jsonBody(request)) });
    if (target === 'lessons' && method === 'POST')
      return NextResponse.json({ id: await pastedLesson(ctx, await jsonBody(request)) });
    if (target === 'preview' && method === 'POST') {
      await rateLimit(`${ctx.workspace}:upload`, 15);
      if (Number(request.headers.get('content-length') || 0) > limits.uploadBytes + 65536)
        throw new AppError('File exceeds 5 MB.', 413);
      // Enforce the streaming body limit before allocating multipart data.
      const reader = request.body!.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limits.uploadBytes + 65536) {
          await reader.cancel();
          throw new AppError('File exceeds 5 MB.', 413);
        }
        chunks.push(value);
      }
      const form = await new Response(Buffer.concat(chunks), {
        headers: { 'Content-Type': request.headers.get('content-type') || '' },
      }).formData();
      const files = form.getAll('file');
      if (files.length !== 1 || !(files[0] instanceof File))
        throw new AppError('Choose one file at a time.');
      const file = files[0];
      const bytes = Buffer.from(await file.arrayBuffer());
      const parsed = await parseUpload(bytes, file.name, file.type);
      const blobId = await putBlob(ctx.workspace, bytes, file.type || 'application/octet-stream');
      return NextResponse.json({ ...parsed, blobId });
    }
    if (target === 'upload' && method === 'POST') {
      const data = z
        .object({
          courseId: z.string().uuid(),
          title: z.string().min(2).max(150),
          format: z.enum(['txt', 'md', 'srt', 'vtt', 'pdf']),
          blobId: z.string().uuid(),
          segments: z
            .array(
              z.object({ location: z.string().max(100), text: z.string().max(limits.textChars) }),
            )
            .min(1)
            .max(limits.segments),
        })
        .parse(await jsonBody(request));
      await rateLimit(`${ctx.workspace}:upload`, 15);
      // Reparse tenant-authorized original bytes; the client cannot forge locations or preview content.
      const original = await getBlob(ctx.workspace, data.blobId);
      const parsed = await parseUpload(
        original.bytes,
        `lesson.${data.format}`,
        original.contentType,
      );
      return NextResponse.json({
        id: await createLesson(ctx, { ...data, segments: parsed.segments }),
      });
    }
    if (target === 'sources' && method === 'POST') {
      await rateLimit(`${ctx.workspace}:sources`, 10);
      return NextResponse.json({ id: await createSource(ctx, await jsonBody(request)) });
    }
    if (target === 'checks' && method === 'POST') {
      await rateLimit(`${ctx.workspace}:checks`, 10);
      const data = z.object({ courseId: z.string().uuid() }).parse(await jsonBody(request));
      return NextResponse.json({ id: await enqueue(ctx.workspace, data.courseId) });
    }
    if (path[0] === 'checks' && path[2] === 'cancel' && method === 'POST') {
      await cancel(ctx.workspace, path[1]);
      return NextResponse.json({ ok: true });
    }
    if (path[0] === 'findings' && path.length === 2 && method === 'PATCH')
      return NextResponse.json(await review(ctx, path[1], await jsonBody(request)));
    if (path[0] === 'findings' && path[2] === 'events' && method === 'GET') {
      await tenantRow('findings', path[1], ctx.workspace);
      return NextResponse.json(
        (
          await db('finding_events')
            .where({ workspace_id: ctx.workspace, finding_id: path[1] })
            .orderBy('created_at', 'desc')
        ).map(unpack),
      );
    }
    if (path[0] === 'lessons' && path.length === 2 && method === 'GET') {
      const lesson = await tenantRow('lessons', path[1], ctx.workspace);
      return NextResponse.json({
        ...lesson,
        versions: (
          await db('lesson_versions')
            .where({ workspace_id: ctx.workspace, lesson_id: lesson.id })
            .orderBy('created_at', 'desc')
        ).map(unpack),
      });
    }
    if (target === 'settings' && method === 'PATCH') {
      await settings(ctx, await jsonBody(request));
      return NextResponse.json({ ok: true });
    }
    if (target === 'schedules' && method === 'POST') {
      await schedule(ctx, await jsonBody(request));
      return NextResponse.json({ ok: true });
    }
    if (target === 'exports' && method === 'POST') {
      await rateLimit(`${ctx.workspace}:exports`, 10);
      const data = z
        .object({ format: z.enum(['md', 'csv', 'pdf']) })
        .parse(await jsonBody(request));
      return NextResponse.json(await exportWork(ctx, data.format));
    }
    if (path[0] === 'exports' && path.length === 2 && method === 'GET') {
      const record = await tenantRow('exports', path[1], ctx.workspace);
      const blob = await getBlob(ctx.workspace, record.blobId);
      return new Response(new Uint8Array(blob.bytes), {
        headers: {
          'Content-Type': blob.contentType,
          'Content-Disposition': `attachment; filename="lessonledger-worklist.${record.format}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }
    if (path[0] === 'blobs' && path.length === 2 && method === 'GET') {
      const blob = await getBlob(ctx.workspace, path[1]);
      return new Response(new Uint8Array(blob.bytes), {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="lesson-data"',
          'Cache-Control': 'private, no-store',
        },
      });
    }
    if (target === 'billing' && method === 'POST') {
      const data = z
        .object({
          plan: z.enum(['starter', 'studio']).default('starter'),
          portal: z.boolean().optional(),
        })
        .parse(await jsonBody(request));
      return NextResponse.json({ url: await checkout(ctx, data.plan, data.portal) });
    }
    if (target === 'diagnostics' && method === 'GET') {
      owner(ctx);
      return NextResponse.json({
        checks: (
          await db('check_runs')
            .where({ workspace_id: ctx.workspace })
            .orderBy('created_at', 'desc')
            .limit(100)
        ).map(unpack),
        deliveries: (
          await db('email_deliveries')
            .where({ workspace_id: ctx.workspace })
            .select('id', 'status', 'created_at')
        ).slice(0, 100),
      });
    }
    if (target === 'workspace/export' && method === 'GET') {
      owner(ctx);
      const tables = [
        'courses',
        'lessons',
        'lesson_versions',
        'sources',
        'source_snapshots',
        'check_runs',
        'check_items',
        'findings',
        'finding_events',
        'schedules',
      ];
      const result: Record<string, unknown> = {};
      for (const table of tables)
        result[table] = (await db(table).where({ workspace_id: ctx.workspace })).map(unpack);
      return NextResponse.json(result, {
        headers: {
          'Content-Disposition': 'attachment; filename="lessonledger-workspace.json"',
          'Cache-Control': 'private, no-store',
        },
      });
    }
    if (target === 'workspace' && method === 'DELETE') {
      const data = z.object({ confirmation: z.literal('DELETE') }).parse(await jsonBody(request));
      void data;
      await deleteWorkspace(ctx);
      return NextResponse.json({ ok: true });
    }
    throw new AppError('Not found.', 404);
  } catch (error) {
    const status =
      error instanceof AppError ? error.status : error instanceof z.ZodError ? 400 : 500;
    const message =
      error instanceof AppError
        ? error.message
        : error instanceof z.ZodError
          ? 'Please check the form fields and try again.'
          : 'Something went wrong. Please try again.';
    if (status === 500)
      console.error(
        JSON.stringify({
          event: 'request_failed',
          correlationId,
          errorType: error instanceof Error ? error.name : 'Unknown',
        }),
      );
    return NextResponse.json(
      { error: message, correlationId },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
