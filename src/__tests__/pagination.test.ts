import { expect, it } from 'vitest';
import { EudamedClient } from '../client.js';
import { readConfig } from '../config.js';
function clientWith(pages: unknown[], maxPages = 10) {
  const urls: string[] = [];
  const client = new EudamedClient(
    { ...readConfig({}), maxPages },
    {
      fetch: async (input) => {
        urls.push(String(input));
        return new Response(JSON.stringify(pages.shift()));
      },
    },
  );
  return { client, urls };
}
const next =
  'https://api.datalake.sante.service.ec.europa.eu/eudamed/udi?PRIMARY_DI=0001&format=json&api-version=v1.0&%24after=cursor';
it('follows nextLink and preserves observation and cache pagination metadata', async () => {
  const { client, urls } = clientWith([
    { value: [{ PRIMARY_DI: '0001', VERSION_NUMBER: 1 }], nextLink: next },
    { value: [{ PRIMARY_DI: '0001', VERSION_NUMBER: 2 }] },
  ]);
  const result = await client.devices({ primaryDi: '0001' });
  expect(result.records).toHaveLength(2);
  expect(urls[1]).toBe(next);
  expect(result.provenance.pagination).toMatchObject({ pagesFetched: 2, complete: true });
  const cached = await client.devices({ primaryDi: '0001' });
  expect(cached.provenance.pagination).toEqual(result.provenance.pagination);
  expect(cached.provenance.cacheHit).toBe(true);
});
it.each([
  'https://evil.example/udi',
  'https://api.datalake.sante.service.ec.europa.eu/other',
  'https://user:pass@api.datalake.sante.service.ec.europa.eu/eudamed/udi',
])('rejects unsafe continuation %s before fetching it', async (nextLink) => {
  const { client, urls } = clientWith([{ value: [{ PRIMARY_DI: '0001' }], nextLink }]);
  await expect(client.devices({ primaryDi: '0001' })).rejects.toThrow(/continuation/i);
  expect(urls).toHaveLength(1);
});
it('returns bounded results with incomplete pagination rather than claiming a complete search', async () => {
  const { client, urls } = clientWith([{ value: [{ PRIMARY_DI: '0001' }], nextLink: next }], 1);
  const result = await client.devices({ primaryDi: '0001' });
  expect(urls).toHaveLength(1);
  expect(result.provenance.pagination).toMatchObject({ pagesFetched: 1, complete: false });
  expect(result.provenance.warnings.join(' ')).toMatch(/page limit/i);
});
it('rejects looping continuation links', async () => {
  const { client } = clientWith([
    { value: [], nextLink: next },
    { value: [], nextLink: next },
  ]);
  await expect(client.devices({ primaryDi: '0001' })).rejects.toThrow(/continuation/i);
});

it('rejects continuation links that silently change the original filter', async () => {
  const { client, urls } = clientWith([
    { value: [], nextLink: next.replace('PRIMARY_DI=0001', 'PRIMARY_DI=other') },
  ]);
  await expect(client.devices({ primaryDi: '0001' })).rejects.toThrow(/Changed query/);
  expect(urls).toHaveLength(1);
});
it('does not cache a partially fetched query when a subsequent page fails', async () => {
  let calls = 0;
  const client = new EudamedClient(
    { ...readConfig({}), maxRetries: 0 },
    {
      fetch: async () => {
        calls++;
        return calls === 1
          ? new Response(JSON.stringify({ value: [{ PRIMARY_DI: '0001' }], nextLink: next }))
          : new Response('', { status: 503 });
      },
    },
  );
  await expect(client.devices({ primaryDi: '0001' })).rejects.toThrow('HTTP 503');
  await expect(client.devices({ primaryDi: '0001' })).rejects.toThrow('HTTP 503');
  expect(calls).toBe(3);
});
it('exposes incomplete query pagination in the human-readable investigation report', async () => {
  const { investigate } = await import('../investigation.js');
  const client = new EudamedClient(
    { ...readConfig({}), maxPages: 1 },
    {
      fetch: async (input) => {
        const u = new URL(String(input));
        u.searchParams.set('$after', 'cursor');
        return new Response(
          JSON.stringify({
            value: String(input).includes('/udi') ? [{ PRIMARY_DI: '0001' }] : [],
            nextLink: u.toString(),
          }),
        );
      },
    },
  );
  const result = await investigate(client, { primaryDi: '0001' });
  expect(result.limits.incompletePaginationQueries).toHaveLength(2);
  expect(result.report).toContain('2 queries stopped at the page limit');
});
