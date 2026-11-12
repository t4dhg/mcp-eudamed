import { expect, it } from 'vitest';
import { EudamedClient } from '../client.js';
import { readConfig } from '../config.js';
import { investigate } from '../investigation.js';
import { normalizeDevice } from '../evidence.js';
const refs = [
  { CODE: 'RISK_CLASS_ID', ID: -10, LANGUAGE: 'en', VALUE: 'Class III' },
  { CODE: 'PLACED_ON_THE_MARKET_ID', ID: -10, LANGUAGE: 'en', VALUE: 'Antarctica' },
];
const ok = (value: unknown[]) => new Response(JSON.stringify({ value }));
function api(fetch: typeof globalThis.fetch) {
  return new EudamedClient({ ...readConfig({}), maxRetries: 0 }, { fetch });
}
it('preserves HTTP evidence and manual fallback without treating 404 as empty', async () => {
  const client = api(async () => new Response(' Data not found ', { status: 404 }));
  await expect(client.devices({ tradeName: 'Example' })).rejects.toMatchObject({
    status: 404,
    details: {
      sourceUrl: expect.stringContaining('TRADE_NAME=Example'),
      responseBody: ' Data not found ',
      bodyTruncated: false,
      retrievedAt: expect.any(String),
    },
    message: expect.stringContaining('https://ec.europa.eu/tools/eudamed/#/screen/search-device'),
  });
});
it('runs outage diagnostics when all investigation device queries fail with 404', async () => {
  const client = api(async (url) =>
    String(url).includes('/udi')
      ? new Response('Data not found', { status: 404 })
      : ok(String(url).includes('/actors') ? [{ ACTOR_ID: 'GB-MF-000017972' }] : refs),
  );
  const result = await investigate(client, {
    tradeName: 'Example',
    manufacturerSrn: 'US-MF-000000001',
  });
  expect(result.status).toBe('partial');
  expect(result.datasetHealth?.status).toBe('probable-device-dataset-outage');
  expect(result.report).toContain('probable-device-dataset-outage');
  expect(result.report).toContain('https://ec.europa.eu/tools/eudamed/#/screen/search-device');
  expect(result.failures[0].error).toContain('Data not found');
});
it.each([true, false])('classifies healthy or inconclusive probes: %s', async (healthy) => {
  const client = api(async () =>
    healthy
      ? ok([
          {
            PRIMARY_DI: '0001',
            BASIC_UDI: '506071773DERM-DX-CEMDRXU',
            MF_SRN: 'GB-MF-000017972',
            ACTOR_ID: 'GB-MF-000017972',
          },
        ])
      : new Response('Unavailable', { status: 503 }),
  );
  expect((await client.status()).status).toBe(healthy ? 'available' : 'inconclusive');
});
it('maps category filters by CODE and applies numeric exact equality', async () => {
  const urls: string[] = [];
  const client = api(async (url) => {
    urls.push(String(url));
    return ok(
      String(url).includes('/reference')
        ? refs
        : [
            {
              PRIMARY_DI: '0001',
              RISK_CLASS_ID: -10,
              APPLICABLE_LEGISLATION_ID: 0,
              NOMENCLATURE_CODE: 'Z12040192',
              SPECIAL_DEVICE_TYPE_ID: 7,
            },
            {
              PRIMARY_DI: '0002',
              RISK_CLASS_ID: -9,
              APPLICABLE_LEGISLATION_ID: 0,
              NOMENCLATURE_CODE: 'Z12040192',
              SPECIAL_DEVICE_TYPE_ID: 7,
            },
          ],
    );
  });
  const result = await client.devices({
    riskClass: 'Class III',
    applicableLegislationId: 0,
    nomenclatureCode: 'Z12040192',
    specialDeviceTypeId: 7,
    exact: true,
  });
  expect(Object.fromEntries(new URL(urls.at(-1)!).searchParams)).toMatchObject({
    RISK_CLASS_ID: '-10',
    APPLICABLE_LEGISLATION_ID: '0',
    NOMENCLATURE_CODE: 'Z12040192',
    SPECIAL_DEVICE_TYPE_ID: '7',
  });
  expect(result.records.map((r) => r.PRIMARY_DI)).toEqual(['0001']);
});
it('accepts numeric risk IDs without references and rejects unknown labels', async () => {
  const client = api(async (url) => {
    expect(String(url)).toContain('/udi?');
    return ok([]);
  });
  await client.devices({ riskClass: -10 });
  await expect(api(async () => ok(refs)).devices({ riskClass: 'Class nonsense' })).rejects.toThrow(
    /risk class/i,
  );
});
it('keeps equal IDs in different reference categories separate', () => {
  const result = normalizeDevice(
    { PRIMARY_DI: '0001', RISK_CLASS_ID: -10, PLACED_ON_THE_MARKET_ID: -10 },
    refs,
  );
  expect(result.decoded.RISK_CLASS_ID).toEqual({ id: -10, label: 'Class III', status: 'resolved' });
  expect(result.decoded.PLACED_ON_THE_MARKET_ID.label).toBe('Antarctica');
});
it('flags truncation when upstream paging stops below the local cap', async () => {
  const client = new EudamedClient(
    { ...readConfig({}), maxPages: 1 },
    {
      fetch: async (url) => {
        const next = new URL(String(url));
        next.searchParams.set('$after', 'cursor');
        return new Response(
          JSON.stringify({ value: [{ PRIMARY_DI: '0001' }], nextLink: next.href }),
        );
      },
    },
  );
  const result = await client.devices({ riskClass: -10 });
  expect(result.provenance.truncated).toBe(true);
  expect(result.provenance.locallyTruncated).toBe(false);
});
it.each(['empty', 'actor-down', 'other-404'])(
  'keeps diagnostic uncertainty for %s',
  async (mode) => {
    const client = api(async (url) => {
      if (String(url).includes('/actors'))
        return mode === 'actor-down'
          ? new Response('down', { status: 503 })
          : ok([{ ACTOR_ID: 'GB-MF-000017972' }]);
      return mode === 'empty'
        ? ok([])
        : new Response(mode === 'other-404' ? 'Unknown route' : 'Data not found', { status: 404 });
    });
    expect((await client.status()).status).toBe('inconclusive');
  },
);
it('bypasses healthy cached controls when checking current health', async () => {
  let down = false;
  const client = api(async (url) =>
    String(url).includes('/actors')
      ? ok([{ ACTOR_ID: 'GB-MF-000017972' }])
      : down
        ? new Response('Data not found', { status: 404 })
        : ok([
            {
              PRIMARY_DI: '0001',
              BASIC_UDI: '506071773DERM-DX-CEMDRXU',
              MF_SRN: 'GB-MF-000017972',
            },
          ]),
  );
  expect((await client.status()).status).toBe('available');
  down = true;
  expect((await client.status()).status).toBe('probable-device-dataset-outage');
});
it('bounds error bodies and retains status and truncation evidence', async () => {
  const client = api(async () => new Response('x'.repeat(10000), { status: 404 }));
  await expect(client.devices({ primaryDi: '0001' })).rejects.toMatchObject({
    status: 404,
    details: { responseBody: 'x'.repeat(4096), bodyTruncated: true },
  });
});
it('does not run diagnostics for successful empty device queries', async () => {
  const urls: string[] = [];
  const client = api(async (url) => {
    urls.push(String(url));
    return ok([]);
  });
  const result = await investigate(client, { tradeName: 'Example' });
  expect(result.datasetHealth).toBeNull();
  expect(result.status).toBe('completed');
  expect(urls.some((url) => url.includes('506071773'))).toBe(false);
});
it('does not run diagnostics if another device query succeeded', async () => {
  const client = api(async (url) =>
    String(url).includes('TRADE_NAME') ? new Response('Data not found', { status: 404 }) : ok([]),
  );
  expect(
    (await investigate(client, { tradeName: 'Example', primaryDi: '0001' })).datasetHealth,
  ).toBeNull();
});
it('rejects ambiguous class labels and wrong-category labels', async () => {
  for (const rows of [[...refs, { ...refs[0], ID: -11 }], [refs[1]]]) {
    await expect(
      api(async () => ok(rows)).devices({
        riskClass: rows.length === 1 ? 'Antarctica' : 'Class III',
      }),
    ).rejects.toThrow(/risk class/i);
  }
});
it('accepts a string risk ID and rejects malformed category IDs before I/O', async () => {
  const client = api(async (url) => {
    expect(new URL(String(url)).searchParams.get('RISK_CLASS_ID')).toBe('-10');
    return ok([]);
  });
  await client.devices({ riskClass: '-10' });
  for (const args of [
    { applicableLegislationId: 1.5 },
    { specialDeviceTypeId: NaN },
    { nomenclatureCode: ' ' },
  ])
    await expect(client.devices(args)).rejects.toThrow();
});
it('does not match a missing field to a literal undefined name', async () => {
  expect(
    (
      await api(async () => ok([{ PRIMARY_DI: '0001' }])).devices({
        tradeName: 'undefined',
        exact: true,
      })
    ).records,
  ).toEqual([]);
});
it('rejects unsafe numeric strings and incomplete reference label resolution', async () => {
  await expect(
    api(async () => ok([])).devices({ riskClass: '999999999999999999999999' }),
  ).rejects.toThrow();
  const client = new EudamedClient(
    { ...readConfig({}), maxPages: 1 },
    {
      fetch: async (url) => {
        const next = new URL(String(url));
        next.searchParams.set('$after', 'cursor');
        return new Response(JSON.stringify({ value: refs, nextLink: next.href }));
      },
    },
  );
  await expect(client.devices({ riskClass: 'Class III' })).rejects.toThrow(/incomplete/i);
});
it('preserves received HTTP status and partial body when the error stream breaks', async () => {
  let reads = 0;
  const client = api(
    async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            if (reads++ === 0) controller.enqueue(new TextEncoder().encode('Data not found'));
            else controller.error(new Error('private transport detail'));
          },
        }),
        { status: 404 },
      ),
  );
  await expect(client.devices({ primaryDi: '0001' })).rejects.toMatchObject({
    code: 'HTTP',
    status: 404,
    details: {
      sourceUrl: expect.stringContaining('PRIMARY_DI=0001'),
      responseBody: 'Data not found',
      bodyReadFailed: true,
    },
  });
});
