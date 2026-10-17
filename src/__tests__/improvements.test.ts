import { describe, it, expect, vi } from 'vitest';
import { EudamedClient } from '../client.js';
import { readConfig } from '../config.js';
import { investigate } from '../investigation.js';
const row = {
  PRIMARY_DI: '0001',
  TRADE_NAME: 'Current',
  MF_SRN: 'US-MF-000000001',
  VERSION_NUMBER: 2,
};
const response = (value: unknown[]) => new Response(JSON.stringify({ value }));
describe('investigation improvements', () => {
  it('keeps identifier matches despite stale names and separates unrelated portfolio devices', async () => {
    const urls: URL[] = [];
    const api = new EudamedClient(readConfig({}), {
      fetch: async (input) => {
        const url = new URL(String(input));
        urls.push(url);
        if (url.pathname.endsWith('/actors')) return response([{ ACTOR_ID: row.MF_SRN }]);
        if (url.pathname.endsWith('/reference')) return response([]);
        if (url.searchParams.has('PRIMARY_DI')) return response([row]);
        if (url.searchParams.has('MF_SRN'))
          return response([row, { ...row, PRIMARY_DI: '0002', TRADE_NAME: 'Other' }]);
        return response([]);
      },
    });
    const result = await investigate(api, { primaryDi: '0001', tradeName: 'Old name' });
    expect(urls[0].searchParams.get('PRIMARY_DI')).toBe('0001');
    expect(urls[0].searchParams.has('TRADE_NAME')).toBe(false);
    expect(result.targetEvidence.map((r) => r.identity.primaryDi)).toEqual(['0001']);
    expect(result.portfolioEvidence.map((r) => r.identity.primaryDi)).toEqual(['0002']);
    expect(result.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'tradeName', supplied: 'Old name', observed: 'Current' }),
      ]),
    );
    expect(result.report).toContain('0001');
    expect(result.report).toContain('unverified');
  });
  it('retains contradictory identity routes without silently choosing one', async () => {
    const api = new EudamedClient(readConfig({}), {
      fetch: async (input) => {
        const url = new URL(String(input));
        return response(
          url.pathname.endsWith('/udi')
            ? [
                {
                  ...row,
                  PRIMARY_DI: url.searchParams.has('BASIC_UDI') ? '0002' : '0001',
                  BASIC_UDI: 'BASIC-OTHER',
                },
              ]
            : [],
        );
      },
    });
    const result = await investigate(api, { primaryDi: '0001', basicUdi: 'BASIC-X' });
    expect(result.conflicts.some((c) => c.field === 'basicUdi')).toBe(true);
    expect(result.identityStatus).toBe('conflicting');
    expect(result.searches.map((s) => s.field)).toEqual(['primaryDi', 'basicUdi']);
  });
  it('enforces a whole-investigation deadline and stops further requests', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>(
        async (_url, init) =>
          new Promise((_resolve, reject) =>
            init!.signal!.addEventListener('abort', () => reject(new Error('aborted'))),
          ),
      );
      const api = new EudamedClient(readConfig({}), { fetch: fetcher });
      const pending = investigate(api, { tradeName: 'Current', deadlineMs: 20 });
      await vi.advanceTimersByTimeAsync(25);
      const result = await pending;
      expect(result.status).toBe('timed-out');
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(result.report).toContain('timed-out');
    } finally {
      vi.useRealTimers();
    }
  });
});
describe('cancellation', () => {
  it('aborts queued requests without blocking unrelated later work', async () => {
    let release!: () => void;
    const started: string[] = [];
    const api = new EudamedClient(readConfig({}), {
      fetch: async (input) => {
        started.push(String(input));
        if (started.length === 1)
          await new Promise<void>((r) => {
            release = r;
          });
        return response([row]);
      },
    });
    const first = api.devices({ primaryDi: '0001' });
    await new Promise((r) => setTimeout(r, 0));
    const controller = new AbortController();
    const cancelled = expect(
      api.devices({ primaryDi: '0002' }, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    controller.abort();
    await cancelled;
    release();
    await first;
    await api.devices({ primaryDi: '0003' });
    expect(started).toHaveLength(2);
    expect(started[1]).toContain('0003');
  });
  it('cancels a retry delay before another fetch', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(
      async () => new Response('', { status: 429, headers: { 'Retry-After': '2' } }),
    );
    const api = new EudamedClient(readConfig({}), { fetch: fetcher });
    const rejected = expect(
      api.devices({ primaryDi: '0001' }, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('deadline and report integrity', () => {
  it('retains already gathered targets when later reference loading times out', async () => {
    const api = new EudamedClient(readConfig({}), {
      fetch: async (input, init) => {
        if (String(input).includes('/udi')) return response([{ PRIMARY_DI: '0001' }]);
        return new Promise((_resolve, reject) =>
          init!.signal!.addEventListener('abort', () => reject(new Error('stop'))),
        );
      },
    });
    const result = await investigate(api, { primaryDi: '0001', deadlineMs: 30 });
    expect(result.status).toBe('timed-out');
    expect(result.targetEvidence[0].identity.primaryDi).toBe('0001');
    expect(result.targetEvidence[0].decoded.RISK_CLASS_ID.status).toBe('unresolved');
    expect(result.report).toContain('Failed step references');
  });
  it('handles already cancelled investigations without any fetch', async () => {
    const fetcher = vi.fn(async () => response([]));
    const api = new EudamedClient(readConfig({}), { fetch: fetcher });
    const result = await investigate(api, { primaryDi: '0001' }, { signal: AbortSignal.abort() });
    expect(result.status).toBe('cancelled');
    expect(result.identityStatus).toBe('unresolved');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('cancels an in-flight request without retrying', async () => {
    const controller = new AbortController();
    let started!: () => void;
    const began = new Promise<void>((r) => {
      started = r;
    });
    const fetcher = vi.fn<typeof fetch>(
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          started();
          init!.signal!.addEventListener('abort', () => reject(new Error('stop')));
        }),
    );
    const api = new EudamedClient(readConfig({}), { fetch: fetcher });
    const result = expect(
      api.devices({ primaryDi: '0001' }, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    await began;
    controller.abort();
    await result;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
