import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { limits } from '../shared/plans';
import type { Segment } from '../shared/types';
import { AppError } from './db';
export const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
export function parseText(text: string, format: string): Segment[] {
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!text.trim() || text.length > limits.textChars || text.includes('\0'))
    throw new AppError('Provide readable text under 180,000 characters.');
  let segments: Segment[];
  if (format === 'srt' || format === 'vtt') {
    if (format === 'vtt' && !text.startsWith('WEBVTT'))
      throw new AppError('VTT files must begin with WEBVTT.');
    segments = text.split(/\n\s*\n/).flatMap((block) => {
      if (/^(WEBVTT|NOTE|STYLE|REGION)/.test(block)) return [];
      const lines = block.split('\n');
      const index = lines.findIndex((line) => line.includes('-->'));
      if (index < 0) throw new AppError('A subtitle cue is missing its timestamp.');
      const match = lines[index].match(
        /^((?:\d{2,}:)?\d{2}:\d{2}[.,]\d{3})\s+-->\s+((?:\d{2,}:)?\d{2}:\d{2}[.,]\d{3})(?:\s+.*)?$/,
      );
      if (
        !match ||
        !lines
          .slice(index + 1)
          .join('')
          .trim()
      )
        throw new AppError('A subtitle cue has invalid timing or empty text.');
      return [
        {
          location: `${match[1]} → ${match[2]}`,
          text: lines
            .slice(index + 1)
            .join('\n')
            .replace(/<[^>]*>/g, '')
            .trim(),
        },
      ];
    });
  } else {
    let line = 1;
    segments = text.split(/(\n\s*\n)/).flatMap((part) => {
      const start = line;
      line += (part.match(/\n/g) || []).length;
      return part.trim() ? [{ location: `Line ${start}`, text: part.trim() }] : [];
    });
  }
  if (!segments.length || segments.length > limits.segments)
    throw new AppError('A lesson must contain between 1 and 300 text segments.');
  return segments;
}
export async function parseUpload(
  bytes: Buffer,
  filename: string,
  mime = '',
): Promise<{ format: string; segments: Segment[] }> {
  if (!bytes.length || bytes.length > limits.uploadBytes)
    throw new AppError('Each file must be between 1 byte and 5 MB.');
  const format = filename.split('.').pop()?.toLowerCase() || '';
  if (!['txt', 'md', 'srt', 'vtt', 'pdf'].includes(format))
    throw new AppError('Supported files: TXT, Markdown, SRT, VTT, and text-based PDF.');
  if (format === 'pdf') {
    if (
      !bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) ||
      (mime && !['application/pdf', 'application/octet-stream'].includes(mime))
    )
      throw new AppError('This file is not a valid PDF.');
    const segments = await new Promise<Segment[]>((resolve, reject) => {
      // A separate process isolates native PDF dependencies and permits hard timeout/resource limits.
      const worker = spawn(
        process.execPath,
        [
          '--max-old-space-size=256',
          '-e',
          `
        const chunks=[];process.stdin.on('data',c=>chunks.push(c));process.stdin.on('end',async()=>{
        try {const {PDFParse}=require('pdf-parse');const parser=new PDFParse({data:new Uint8Array(Buffer.concat(chunks))});
        const info=await parser.getInfo();if(info.total>80)throw new Error('page limit');
        const result=await parser.getText();await parser.destroy();
        process.stdout.write(JSON.stringify({segments:result.pages.map(p=>({location:'Page '+p.num,text:p.text.trim()})).filter(p=>p.text)}));
        }catch{process.stdout.write(JSON.stringify({error:true}));} });`,
        ],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] },
      );
      let output = '';
      const timer = setTimeout(() => {
        worker.kill();
        reject(new AppError('PDF parsing timed out. Try a smaller text-based PDF.'));
      }, 15000);
      worker.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.length > limits.textChars * 2) {
          worker.kill();
          reject(new AppError('PDF text exceeds the resource limit.'));
        }
      });
      worker.on('close', (code) => {
        clearTimeout(timer);
        try {
          const message = JSON.parse(output);
          if (code !== 0 || message.error) throw new Error();
          resolve(message.segments);
        } catch {
          reject(
            new AppError(
              'Unable to read this PDF. Use an unencrypted, text-based PDF of at most 80 pages.',
            ),
          );
        }
      });
      worker.on('error', () => {
        clearTimeout(timer);
        reject(new AppError('Unable to read this PDF.'));
      });
      worker.stdin.on('error', () => {});
      worker.stdin.end(bytes);
    });
    if (!segments.length || segments.every((s) => s.text.length < 10))
      throw new AppError(
        'This PDF has no usable text layer. Scanned PDFs require OCR before import; OCR is not included.',
      );
    if (segments.reduce((n, s) => n + s.text.length, 0) > limits.textChars)
      throw new AppError('PDF text exceeds 180,000 characters.');
    return { format, segments };
  }
  if (
    mime &&
    ![
      'text/plain',
      'text/markdown',
      'text/vtt',
      'application/x-subrip',
      'application/octet-stream',
    ].includes(mime)
  )
    throw new AppError('File type does not match an accepted text format.');
  if (
    bytes.subarray(0, 5).toString() === '%PDF-' ||
    (bytes[0] === 0x4d && bytes[1] === 0x5a) ||
    (bytes[0] === 0x50 && bytes[1] === 0x4b)
  )
    throw new AppError('Binary content cannot be imported as text.');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new AppError('Save this file as UTF-8 text and try again.');
  }
  return { format, segments: parseText(text, format) };
}
