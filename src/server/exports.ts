import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { db, id, now, encode, unpack, AppError } from './db';
import { putBlob } from './storage';
import type { Context } from './context';

export function csvCell(value: string) {
  const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function markdownText(value: string) {
  return value.replace(/[\\`*_{}\[\]()<>#!|]/g, '\\$&');
}
export async function exportWork(ctx: Context, format: 'md' | 'csv' | 'pdf') {
  const findings = (
    await db('findings')
      .where({ workspace_id: ctx.workspace, status: 'confirmed' })
      .orderBy('created_at')
  ).map(unpack);
  const title = `${ctx.demo ? 'Sample workspace — ' : ''}LessonLedger approved worklist`;
  let bytes: Buffer;
  let type: string;
  const rows = findings.map((f) => [
    f.title,
    f.lessonTitle,
    f.location,
    f.severity,
    f.original,
    f.replacement,
    f.evidence,
    f.sourceUrl,
    f.capturedAt,
    f.provenance,
  ]);
  if (format === 'csv') {
    bytes = Buffer.from(
      '\uFEFF' +
        [
          [
            'Title',
            'Lesson',
            'Location',
            'Severity',
            'Original',
            'Approved draft',
            'Evidence',
            'Source URL',
            'Captured at',
            'Provenance',
          ],
          ...rows,
        ]
          .map((row) => row.map(csvCell).join(','))
          .join('\r\n'),
    );
    type = 'text/csv; charset=utf-8';
  } else if (format === 'md') {
    bytes = Buffer.from(
      `# ${title}\n\nExported ${now()}. ${findings.length} confirmed findings.\n\n` +
        findings
          .map(
            (f) =>
              `## ${markdownText(f.title)}\n\n**Lesson:** ${markdownText(f.lessonTitle)} · ${markdownText(f.location)}\n\n**Original:** ${markdownText(f.original)}\n\n**Approved draft:** ${markdownText(f.replacement)}\n\n**Evidence:** ${markdownText(f.evidence)}\n\nSource: ${markdownText(f.sourceUrl)}\n\nCaptured: ${f.capturedAt}; provenance: ${markdownText(f.provenance)}\n`,
          )
          .join('\n'),
    );
    type = 'text/markdown; charset=utf-8';
  } else {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(
      await readFile(join(process.cwd(), 'public/fonts/DM-Sans.ttf')),
      { subset: true },
    );
    const characters = new Set(font.getCharacterSet());
    let page = doc.addPage();
    let y = 790;
    const draw = (text: string, size = 10) => {
      if ([...text].some((c) => !/\s/.test(c) && !characters.has(c.codePointAt(0)!)))
        throw new AppError(
          'This worklist contains characters the PDF font cannot represent. Export Markdown or CSV to preserve all text.',
        );
      const words = text.split(/\s+/);
      let line = '';
      const emit = () => {
        if (y < 50) {
          page = doc.addPage();
          y = 790;
        }
        page.drawText(line, { x: 45, y, size, font, color: rgb(0.09, 0.14, 0.12) });
        y -= size + 6;
        line = '';
      };
      for (const word of words) {
        if (font.widthOfTextAtSize(`${line} ${word}`, size) > 500 && line) emit();
        if (word.length > 90) {
          for (let i = 0; i < word.length; i += 75) {
            line = word.slice(i, i + 75);
            emit();
          }
        } else line += (line ? ' ' : '') + word;
      }
      if (line) emit();
      y -= 8;
    };
    draw(title, 18);
    draw(`Exported ${now()} | ${findings.length} confirmed findings`);
    for (const f of findings) {
      draw(f.title, 14);
      draw(`${f.lessonTitle} | ${f.location} | ${f.severity}`);
      draw(`Original: ${f.original}`);
      draw(`Approved draft: ${f.replacement}`);
      draw(`Evidence: ${f.evidence}`);
      draw(`Source: ${f.sourceUrl} | Captured: ${f.capturedAt} | ${f.provenance}`);
    }
    bytes = Buffer.from(await doc.save());
    type = 'application/pdf';
  }
  const blobId = await putBlob(ctx.workspace, bytes, type);
  const exportId = id();
  await db('exports').insert({
    id: exportId,
    workspace_id: ctx.workspace,
    created_at: now(),
    payload: encode({ blobId, format, count: findings.length }),
  });
  return { id: exportId, blobId, filename: `lessonledger-worklist.${format}` };
}
