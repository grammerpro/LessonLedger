import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import * as cheerio from 'cheerio';
import { limits } from '../shared/plans';
import { AppError } from './db';

export function publicIp(address: string) {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === 'unicast';
  } catch {
    return false;
  }
}
export function validateUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError('Enter a complete public HTTP or HTTPS URL.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port))
  )
    throw new AppError('Sources require HTTP(S), standard ports, and no URL credentials.');
  const host = url.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    (!host.includes('.') && !host.includes(':'))
  )
    throw new AppError('Private or local hosts are not allowed.');
  if (ipaddr.isValid(host) && !publicIp(host))
    throw new AppError('Private, reserved, and metadata addresses are not allowed.');
  url.hash = '';
  return url;
}
export async function safeFetch(
  raw: string,
  conditional?: { etag?: string; modified?: string },
  hop = 0,
  deadline = Date.now() + 20000,
): Promise<{ text: string; url: string; etag?: string; modified?: string; unchanged?: boolean }> {
  if (hop > 4 || Date.now() >= deadline)
    throw new AppError('Source exceeded redirect or time limits.');
  const url = validateUrl(raw);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await Promise.race([
    lookup(hostname, { all: true }),
    new Promise<never>((_, reject) => {
      const t = setTimeout(() => reject(new AppError('DNS lookup timed out.')), 4000);
      t.unref();
    }),
  ]);
  if (!addresses.length || addresses.some((a) => !publicIp(a.address)))
    throw new AppError('Source resolves to a private or reserved address.');
  // Pin the validated address in the actual socket lookup. No second DNS query/rebinding window.
  const pinned = addresses[0];
  const result = await new Promise<{
    code: number;
    headers: http.IncomingHttpHeaders;
    body: string;
  }>((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.get(
      url,
      {
        agent: false,
        lookup: ((_h: string, options: any, callback: any) =>
          options.all
            ? callback(null, [{ address: pinned.address, family: pinned.family }])
            : callback(null, pinned.address, pinned.family)) as any,
        headers: {
          'User-Agent': 'LessonLedger/1.0 source-monitor',
          Accept: 'text/html,text/plain',
          'Accept-Encoding': 'identity',
          ...(conditional?.etag ? { 'If-None-Match': conditional.etag } : {}),
          ...(conditional?.modified ? { 'If-Modified-Since': conditional.modified } : {}),
        },
      },
      (response) => {
        const code = response.statusCode || 500;
        if ([301, 302, 303, 307, 308, 304].includes(code)) {
          response.resume();
          resolve({ code, headers: response.headers, body: '' });
          return;
        }
        if (code !== 200) {
          response.destroy();
          reject(new AppError(`Source returned HTTP ${code}; it was not checked.`));
          return;
        }
        if (
          !/^(text\/html|text\/plain|application\/xhtml\+xml)/i.test(
            response.headers['content-type'] || '',
          )
        ) {
          response.destroy();
          reject(new AppError('Source must serve HTML or plain text.'));
          return;
        }
        if (
          response.headers['content-encoding'] &&
          response.headers['content-encoding'] !== 'identity'
        ) {
          response.destroy();
          reject(new AppError('Compressed source responses are not accepted.'));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > limits.sourceBytes)
            request.destroy(new AppError('Source exceeds the 2 MB response limit.'));
          else chunks.push(chunk);
        });
        response.on('end', () =>
          resolve({
            code,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        response.on('error', reject);
      },
    );
    const timer = setTimeout(
      () => request.destroy(new AppError('Source fetch timed out.')),
      Math.max(1, deadline - Date.now()),
    );
    request.on('close', () => clearTimeout(timer));
    request.on('error', reject);
  });
  if (result.code === 304) return { text: '', url: url.href, unchanged: true };
  if ([301, 302, 303, 307, 308].includes(result.code)) {
    if (!result.headers.location) throw new AppError('Source redirect has no destination.');
    return safeFetch(new URL(result.headers.location, url).href, undefined, hop + 1, deadline);
  }
  let text = result.body;
  if (result.headers['content-type']?.includes('html')) {
    const $ = cheerio.load(text);
    $('script, style, nav, footer, header, aside, noscript, form, svg').remove();
    const main = $('main, article, [role=main]').first();
    text = (main.length ? main : $('body')).text();
  }
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length < 40)
    throw new AppError(
      'Source has insufficient readable content. It may require a browser or block access.',
    );
  return {
    text: text.slice(0, 100000),
    url: url.href,
    etag: result.headers.etag,
    modified: result.headers['last-modified'],
  };
}
