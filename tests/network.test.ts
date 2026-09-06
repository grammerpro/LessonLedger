import { beforeEach, describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import https from 'node:https';
const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
import { safeFetch } from '../src/server/safe-fetch';

function responseFixture(code: number, headers: Record<string, string>, body = '') {
  const request = new EventEmitter() as any;
  request.destroy = (error?: Error) => {
    if (error) request.emit('error', error);
    request.emit('close');
  };
  const response = new EventEmitter() as any;
  response.statusCode = code;
  response.headers = headers;
  response.resume = () => queueMicrotask(() => request.emit('close'));
  response.destroy = () => request.emit('close');
  return {
    request,
    response,
    send(callback: any) {
      queueMicrotask(() => {
        callback(response);
        if (code === 200) {
          response.emit('data', Buffer.from(body));
          response.emit('end');
          request.emit('close');
        }
      });
      return request;
    },
  };
}
beforeEach(() => {
  vi.restoreAllMocks();
  mocks.lookup.mockReset();
  mocks.lookup.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
});
describe('actual safe-fetch transport boundaries', () => {
  it('pins validated DNS into the socket lookup without resolving again', async () => {
    const fixture = responseFixture(
      200,
      { 'content-type': 'text/plain' },
      'A public documentation page with enough useful text to inspect.',
    );
    vi.spyOn(https, 'get').mockImplementation(((url: any, options: any, callback: any) => {
      expect(url.hostname).toBe('docs.example.com');
      let connected = '';
      options.lookup('docs.example.com', {}, (_e: any, address: string) => (connected = address));
      expect(connected).toBe('1.1.1.1');
      mocks.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
      return fixture.send(callback);
    }) as any);
    expect((await safeFetch('https://docs.example.com')).text).toContain('public documentation');
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });
  it('rejects a private redirect before opening a second socket', async () => {
    const fixture = responseFixture(302, { location: 'http://169.254.169.254/latest/meta-data' });
    const get = vi
      .spyOn(https, 'get')
      .mockImplementation(((_url: any, _options: any, callback: any) =>
        fixture.send(callback)) as any);
    const plain = vi.spyOn(http, 'get');
    await expect(safeFetch('https://docs.example.com')).rejects.toThrow('addresses');
    expect(get).toHaveBeenCalledTimes(1);
    expect(plain).not.toHaveBeenCalled();
  });
  it('rejects mixed public/private DNS answers before connecting', async () => {
    mocks.lookup.mockResolvedValue([
      { address: '1.1.1.1', family: 4 },
      { address: '::1', family: 6 },
    ]);
    const get = vi.spyOn(https, 'get');
    await expect(safeFetch('https://docs.example.com')).rejects.toThrow('private');
    expect(get).not.toHaveBeenCalled();
  });
  it('blocks a redirect whose new DNS answer is private', async () => {
    mocks.lookup
      .mockResolvedValueOnce([{ address: '1.1.1.1', family: 4 }])
      .mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }]);
    const fixture = responseFixture(302, { location: 'https://redirect.example.com' });
    const get = vi
      .spyOn(https, 'get')
      .mockImplementation(((_url: any, _options: any, callback: any) =>
        fixture.send(callback)) as any);
    await expect(safeFetch('https://docs.example.com')).rejects.toThrow('private');
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('bounds response bytes and rejects unexpected content types', async () => {
    let fixture = responseFixture(200, { 'content-type': 'application/octet-stream' }, 'binary');
    vi.spyOn(https, 'get').mockImplementation(((_url: any, _options: any, callback: any) =>
      fixture.send(callback)) as any);
    await expect(safeFetch('https://docs.example.com')).rejects.toThrow('HTML or plain text');
    fixture = responseFixture(
      200,
      { 'content-type': 'text/plain' },
      'x'.repeat(2 * 1024 * 1024 + 1),
    );
    await expect(safeFetch('https://docs.example.com')).rejects.toThrow('2 MB');
  });
  it('uses conditional headers and records an unchanged response honestly', async () => {
    const fixture = responseFixture(304, {});
    vi.spyOn(https, 'get').mockImplementation(((_url: any, options: any, callback: any) => {
      expect(options.headers['If-None-Match']).toBe('"version-1"');
      return fixture.send(callback);
    }) as any);
    expect((await safeFetch('https://docs.example.com', { etag: '"version-1"' })).unchanged).toBe(
      true,
    );
  });
});
