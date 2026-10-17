import { afterEach, describe, expect, it, vi } from 'vitest';
import { EudamedClient } from '../client.js';
import { readConfig } from '../config.js';
import { numericFlag, parseEmbeddedJson } from '../evidence.js';
import { errorMessage } from '../errors.js';
const cfg = readConfig({});
const ok = () => new Response(JSON.stringify({ value: [{ PRIMARY_DI: '0001' }] }));
afterEach(() => vi.useRealTimers());
describe('bounded HTTP', () => {
  it('expires and clears cached data', async () => {
    let now = 0;
    const fetcher = vi.fn(async () => ok());
    const client = new EudamedClient(
      { ...cfg, cacheTtlMs: 10 },
      { fetch: fetcher, now: () => now },
    );
    await client.devices({ primaryDi: '0001' });
    now = 11;
    const expired = await client.devices({ primaryDi: '0001' });
    expect(expired.provenance.cacheHit).toBe(false);
    expect(expired.provenance.retrievedAt).toBe(new Date(11).toISOString());
    client.http.clearCache();
    await client.devices({ primaryDi: '0001' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('evicts the oldest entry when its bounded cache fills', async () => {
    const fetcher = vi.fn(async () => ok());
    const client = new EudamedClient(cfg, { fetch: fetcher });
    for (let i = 0; i < 33; i++) await client.devices({ primaryDi: String(i) });
    await client.devices({ primaryDi: '0' });
    expect(fetcher).toHaveBeenCalledTimes(34);
  });
  it('rejects oversized bodies with and without Content-Length', async () => {
    for (const headers of [new Headers(), new Headers({ 'content-length': '999' })]) {
      const client = new EudamedClient(
        { ...cfg, maxResponseBytes: 10 },
        { fetch: async () => new Response('x'.repeat(100), { headers }) },
      );
      await expect(client.devices({ primaryDi: '0001' })).rejects.toMatchObject({ code: 'SIZE' });
    }
  });
  it('rejects empty response streams', async () => {
    const client = new EudamedClient(cfg, { fetch: async () => new Response(null) });
    await expect(client.devices({ primaryDi: '0001' })).rejects.toMatchObject({ code: 'JSON' });
  });
  it('bounds retries for transient network failures', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('private upstream URL');
    });
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const client = new EudamedClient({ ...cfg, maxRetries: 2 }, { fetch: fetcher, sleep });
    await expect(client.devices({ primaryDi: '0001' })).rejects.toThrow(
      'EUDAMED network request failed',
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls[0][0]).toBeGreaterThanOrEqual(1000);
  });
  it('times out and aborts the actual request', async () => {
    vi.useFakeTimers();
    let aborted = false;
    const client = new EudamedClient(
      { ...cfg, timeoutMs: 10, maxRetries: 0 },
      {
        fetch: async (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init!.signal!.addEventListener('abort', () => {
              aborted = true;
              reject(new Error('abort'));
            });
          }),
      },
    );
    const pending = expect(client.devices({ primaryDi: '0001' })).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(11);
    await pending;
    expect(aborted).toBe(true);
  });
  it('uses date Retry-After, ignores invalid values, and does not retry before long cooldowns', async () => {
    for (const [header, expected] of [
      ['Thu, 01 Jan 1970 00:00:02 GMT', 2000],
      ['invalid', null],
      ['60', -1],
    ] as const) {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          new Response('', { status: 503, headers: { 'Retry-After': header } }),
        )
        .mockResolvedValueOnce(ok());
      const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
      const client = new EudamedClient(cfg, { fetch: fetcher, sleep, now: () => 0 });
      if (expected === -1) {
        await expect(client.devices({ primaryDi: '0001' })).rejects.toMatchObject({ status: 503 });
        expect(sleep).not.toHaveBeenCalled();
      } else {
        await client.devices({ primaryDi: '0001' });
        if (expected !== null) expect(sleep).toHaveBeenCalledWith(expected);
        else expect(sleep.mock.calls[0][0]).toBeGreaterThanOrEqual(1000);
      }
    }
  });
  it('serializes concurrent requests and recovers the queue after errors', async () => {
    let active = 0;
    let peak = 0;
    const client = new EudamedClient(
      { ...cfg, maxRetries: 0 },
      {
        fetch: async (input) => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 1));
          active--;
          return String(input).includes('bad') ? new Response('', { status: 400 }) : ok();
        },
      },
    );
    const result = await Promise.allSettled(
      ['bad', 'good', 'next'].map((primaryDi) => client.devices({ primaryDi })),
    );
    expect(result.map((r) => r.status)).toEqual(['rejected', 'fulfilled', 'fulfilled']);
    expect(peak).toBe(1);
  });
});
describe('normalization helpers', () => {
  it.each([
    [1, true],
    [0, false],
    [true, true],
    [false, false],
    [null, null],
    [2, null],
    ['1', null],
  ])('preserves tri-state flags: %s', (input, expected) =>
    expect(numericFlag(input)).toBe(expected),
  );
  it('defensively parses embedded JSON without inventing structure', () => {
    expect(parseEmbeddedJson('{"texts":[]}')).toEqual({ texts: [] });
    expect(parseEmbeddedJson('{')).toBeNull();
    expect(parseEmbeddedJson(null)).toBeNull();
  });
  it('does not expose arbitrary exception text', () =>
    expect(errorMessage(new Error('private'))).not.toContain('private'));
});
