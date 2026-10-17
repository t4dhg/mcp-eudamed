import { afterEach, describe, expect, it, vi } from 'vitest';
import { EudamedClient } from '../client.js';
import { readConfig } from '../config.js';

const device = {
  PRIMARY_DI: '000123',
  BASIC_UDI: '000ABC',
  TRADE_NAME: 'Example',
  MF_SRN: 'US-MF-000000001',
  MEDICAL_PURPOSE: null,
  ACTIVE: 1,
  STERILE: null,
  RISK_CLASS_ID: -1,
  EXTRA: 'retained',
};
const response = (value: unknown) => new Response(JSON.stringify({ value }));
function setup(responses: Response[]) {
  const fetcher = vi.fn<typeof fetch>(async () => responses.shift()!);
  const sleep = vi.fn(async () => {});
  const client = new EudamedClient({ ...readConfig({}), maxRetries: 1 }, { fetch: fetcher, sleep });
  return { client, fetcher, sleep };
}
afterEach(() => vi.restoreAllMocks());
describe('configuration', () => {
  it('rejects invalid numeric and unsafe URL settings', () => {
    for (const env of [
      { EUDAMED_TIMEOUT_MS: 'no' },
      { EUDAMED_MAX_RETRIES: '-1' },
      { EUDAMED_BASE_URL: 'http://localhost' },
      { EUDAMED_BASE_URL: 'https://user:pass@example.com' },
    ])
      expect(() => readConfig(env)).toThrow();
  });
});
describe('adapter contract', () => {
  it('requires a restrictive nonblank filter before fetching', async () => {
    const { client, fetcher } = setup([]);
    await expect(client.devices({})).rejects.toThrow();
    await expect(client.devices({ tradeName: ' ' })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('encodes filters, preserves identifiers and unknown fields, and exact-matches locally', async () => {
    const { client, fetcher } = setup([
      response([device, { ...device, TRADE_NAME: 'Example Plus' }]),
    ]);
    const result = await client.devices({ tradeName: ' example ', exact: true });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ PRIMARY_DI: '000123', EXTRA: 'retained' });
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.searchParams.get('TRADE_NAME')).toBe('example');
    expect(url.searchParams.get('api-version')).toBe('v1.0');
    expect(result.provenance.returnedByApi).toBe(2);
    expect(result.provenance.coverage).toBe('unknown');
  });
  it('reports local truncation without claiming pagination', async () => {
    const { client } = setup([response([device, { ...device, PRIMARY_DI: '000124' }])]);
    const result = await client.devices({ manufacturerSrn: device.MF_SRN, limit: 1 });
    expect(result.records).toHaveLength(1);
    expect(result.provenance.truncated).toBe(true);
    expect(result.provenance.matched).toBe(2);
  });
  it('caches validated responses without refreshing the observation timestamp', async () => {
    const { client, fetcher } = setup([response([device])]);
    const first = await client.devices({ primaryDi: '000123' });
    first.records[0].TRADE_NAME = 'mutation';
    const second = await client.devices({ primaryDi: '000123' });
    expect(second.records[0].TRADE_NAME).toBe('Example');
    expect(second.provenance.cacheHit).toBe(true);
    expect(second.provenance.retrievedAt).toBe(first.provenance.retrievedAt);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('retries 429 and respects Retry-After', async () => {
    const { client, fetcher, sleep } = setup([
      new Response('', { status: 429, headers: { 'Retry-After': '2' } }),
      response([]),
    ]);
    await client.devices({ tradeName: 'Example' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });
  it('does not retry ordinary 4xx or print upstream bodies', async () => {
    const { client, fetcher } = setup([new Response('private contact', { status: 400 })]);
    await expect(client.devices({ tradeName: 'Example' })).rejects.toThrow('HTTP 400');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    new Response('{}'),
    new Response('html'),
    response([{ PRIMARY_DI: 123 }]),
    response([null]),
  ])('rejects malformed contracts', async (res) => {
    const { client } = setup([res]);
    await expect(client.devices({ tradeName: 'Example' })).rejects.toThrow();
  });
  it('omits contact fields and filters actor identity locally', async () => {
    const { client } = setup([
      response([
        {
          ACTOR_ID: device.MF_SRN,
          NAME: 'Example Ltd',
          PRRC_FIRST_NAME: 'Private',
          ACT_EMAIL: 'private@example.org',
          ACTOR_TYPE: 'Manufacturer',
        },
        { ACTOR_ID: 'OTHER', NAME: 'Other' },
      ]),
    ]);
    const result = await client.actors({ actorId: device.MF_SRN });
    expect(result.records).toEqual([
      { ACTOR_ID: device.MF_SRN, NAME: 'Example Ltd', ACTOR_TYPE: 'Manufacturer' },
    ]);
  });
  it('filters reference codes and IDs without collision', async () => {
    const { client } = setup([
      response([
        { CODE: 'RISK_CLASS_ID', ID: -1, LANGUAGE: 'en', VALUE: 'Class IIa' },
        { CODE: 'STATUS_ID', ID: -1, LANGUAGE: 'en', VALUE: 'Active' },
      ]),
    ]);
    const result = await client.references({ code: 'RISK_CLASS_ID', id: -1 });
    expect(result.records.map((x) => x.VALUE)).toEqual(['Class IIa']);
  });
});
