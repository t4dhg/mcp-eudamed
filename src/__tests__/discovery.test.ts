import { describe, expect, it } from 'vitest';
import { EudamedClient } from '../client.js';
import { readConfig } from '../config.js';
import { investigate } from '../investigation.js';
const srn = 'US-MF-000000001';
function setup(rows: unknown[]) {
  const urls: URL[] = [];
  const client = new EudamedClient(readConfig({}), {
    fetch: async (input) => {
      urls.push(new URL(String(input)));
      return new Response(JSON.stringify({ value: rows }));
    },
  });
  return { client, urls };
}
describe('company and identifier discovery', () => {
  it('rejects company names and wrong roles in manufacturer SRNs before network access', async () => {
    const { client, urls } = setup([]);
    for (const manufacturerSrn of ['Example Ltd', 'US-AR-000000001', 'US-MF-123'])
      await expect(client.devices({ manufacturerSrn })).rejects.toThrow(/manufacturer.*SRN/i);
    await expect(client.actors({ actorId: 'Example Ltd' })).rejects.toThrow(/actor.*ID/i);
    expect(urls).toHaveLength(0);
  });
  it('queries legal and abbreviated names independently, deduplicates and excludes contacts', async () => {
    const { client, urls } = setup([
      {
        ACTOR_ID: srn,
        NAME: 'Example Medical Ltd',
        ABBREVIATED_NAME: 'Example',
        ACTOR_TYPE: 'Manufacturer',
        ACT_COUNTRY_ISO2_CODE: 'US',
        ACT_EMAIL: 'private@example.org',
      },
      {
        ACTOR_ID: srn,
        NAME: 'Example Medical Ltd',
        ABBREVIATED_NAME: 'Example',
        ACTOR_TYPE: 'Manufacturer',
        ACT_COUNTRY_ISO2_CODE: 'US',
      },
      { ACTOR_ID: 'DE-MF-000000002', NAME: 'Unrelated Ltd' },
    ]);
    const result = await client.discoverActors({ name: 'Example', country: 'US' });
    expect(
      urls.map((u) => u.searchParams.get('NAME') ?? u.searchParams.get('ABBREVIATED_NAME')),
    ).toEqual(['Example', 'Example']);
    expect(urls.every((u) => u.searchParams.get('ACT_COUNTRY_ISO2_CODE') === 'US')).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(JSON.stringify(result.candidates)).not.toContain('private@');
    expect(result.status).toBe('candidates');
    expect(result.coverage).toBe('unknown');
  });
  it('preserves distinct company candidates and provides portal fallback for empty searches', async () => {
    const { client } = setup([]);
    const result = await client.discoverActors({ name: 'Example & Sons' });
    expect(result.status).toBe('not-found');
    expect(result.portalUrl).toContain('name=Example%20%26%20Sons');
    expect(result.nextSteps.join(' ')).toMatch(/registered.*name/i);
  });
  it('extracts GS1 DI without sending production identifiers and reports the original input', async () => {
    const { client, urls } = setup([{ PRIMARY_DI: '00012345678905' }]);
    const input = '(01)00012345678905(10)LOT123(17)271231';
    const result = await client.devices({ primaryDi: input, exact: true });
    expect(urls[0].searchParams.get('PRIMARY_DI')).toBe('00012345678905');
    expect(result.records).toHaveLength(1);
    expect(result.identifier).toMatchObject({
      original: input,
      primaryDi: '00012345678905',
      changed: true,
    });
  });
  it('rejects malformed GS1 rather than silently treating it as a raw DI', async () => {
    const { client, urls } = setup([]);
    for (const primaryDi of [
      '(01)123(10)LOT',
      '(01)00012345678906(10)LOT',
      '(01)00012345678905(01)00012345678905',
    ])
      await expect(client.devices({ primaryDi })).rejects.toThrow(/GS1/);
    expect(urls).toHaveLength(0);
  });
  it('keeps legacy IDs unchanged and supplies next steps on no match', async () => {
    const { client, urls } = setup([]);
    const result = await client.devices({ primaryDi: 'D-Example8U' });
    expect(urls[0].searchParams.get('PRIMARY_DI')).toBe('D-Example8U');
    expect(result.nextSteps.join(' ')).toMatch(/public portal/i);
  });
  it('uses the extracted DI in investigation matching, without false identity conflicts', async () => {
    const client = new EudamedClient(readConfig({}), {
      fetch: async (input) =>
        new Response(
          JSON.stringify({
            value: String(input).includes('/udi') ? [{ PRIMARY_DI: '00012345678905' }] : [],
          }),
        ),
    });
    const result = await investigate(client, { primaryDi: '(01)00012345678905(10)LOT' });
    expect(result.identityStatus).toBe('identifier-match');
    expect(result.conflicts).toEqual([]);
    expect(result.identifier?.original).toBe('(01)00012345678905(10)LOT');
  });
});

it('retains partial discovery evidence when one name route fails', async () => {
  const client = new EudamedClient(
    { ...readConfig({}), maxRetries: 0 },
    {
      fetch: async (input) =>
        String(input).includes('ABBREVIATED_NAME')
          ? new Response('', { status: 503 })
          : new Response(
              JSON.stringify({ value: [{ ACTOR_ID: 'US-MF-000000001', NAME: 'Example' }] }),
            ),
    },
  );
  const result = await client.discoverActors({ name: 'Example' });
  expect(result.status).toBe('partial');
  expect(result.candidates).toHaveLength(1);
  expect(result.failures).toEqual([
    { field: 'ABBREVIATED_NAME', error: 'EUDAMED returned HTTP 503' },
  ]);
});
it('preserves ambiguous entities and marks candidate limits', async () => {
  const { client } = setup([
    { ACTOR_ID: 'US-MF-000000001', NAME: 'Example' },
    { ACTOR_ID: 'DE-MF-000000002', NAME: 'Example' },
  ]);
  const result = await client.discoverActors({ name: 'Example', limit: 1 });
  expect(result.candidates).toHaveLength(1);
  expect(result.omittedCandidates).toBe(1);
});
it('cancels company discovery without misreporting an empty success', async () => {
  const { client, urls } = setup([]);
  await expect(
    client.discoverActors({ name: 'Example' }, { signal: AbortSignal.abort() }),
  ).rejects.toThrow();
  expect(urls).toHaveLength(0);
});
it('marks discovery partial when a name route reaches the page cap', async () => {
  const client = new EudamedClient(
    { ...readConfig({}), maxPages: 1 },
    {
      fetch: async (input) => {
        const next = new URL(String(input));
        next.searchParams.set('$after', 'cursor');
        return new Response(JSON.stringify({ value: [], nextLink: next.toString() }));
      },
    },
  );
  expect((await client.discoverActors({ name: 'Example' })).status).toBe('partial');
});
