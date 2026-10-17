import { describe, expect, it } from 'vitest';
import { normalizeDevice } from '../evidence.js';
import { EudamedClient } from '../client.js';
import { readConfig } from '../config.js';
import { investigate } from '../investigation.js';

const references = [
  { CODE: 'RISK_CLASS_ID', ID: -1, LANGUAGE: 'en', VALUE: 'Class IIa' },
  { CODE: 'STATUS_ID', ID: -1, LANGUAGE: 'en', VALUE: 'Active' },
];
describe('evidence', () => {
  it('joins by CODE and ID, preserves unknowns, and never equates public purpose with controlled IFU', () => {
    const result = normalizeDevice(
      {
        PRIMARY_DI: '0001',
        RISK_CLASS_ID: -1,
        STATUS_ID: -1,
        STERILE: null,
        ACTIVE: 1,
        MEASURING_FUNCTION: 0,
        REUSABLE: 2,
        NOMENCLATURE_CODE: ' Z123 ',
        MEDICAL_PURPOSE: 'Public purpose',
      },
      references,
    );
    expect(result.decoded.RISK_CLASS_ID).toEqual({
      id: -1,
      label: 'Class IIa',
      status: 'resolved',
    });
    expect(result.decoded.STATUS_ID.label).toBe('Active');
    expect(result.flags).toMatchObject({
      STERILE: null,
      ACTIVE: true,
      MEASURING_FUNCTION: false,
      REUSABLE: null,
    });
    expect(result.identity.nomenclatureCode).toBe('Z123');
    expect(result.documents.ifu.status).toBe('unverified');
    expect(result.intendedPurpose.status).toBe('public-record');
    expect(JSON.stringify(result)).not.toContain('"compliant"');
  });
  it('marks absent reference values and purpose as unresolved', () => {
    const result = normalizeDevice({ RISK_CLASS_ID: -999, MEDICAL_PURPOSE: null }, []);
    expect(result.decoded.RISK_CLASS_ID.status).toBe('unresolved');
    expect(result.intendedPurpose.status).toBe('missing');
  });
  it('discovers the actual manufacturer independently of an incorrect supplied SRN', async () => {
    const calls: URL[] = [];
    const client = new EudamedClient(readConfig({}), {
      fetch: async (input) => {
        const url = new URL(String(input));
        calls.push(url);
        let value: unknown[] = [];
        if (url.pathname.endsWith('/reference')) value = references;
        else if (url.pathname.endsWith('/actors'))
          value = [{ ACTOR_ID: url.searchParams.get('ACTOR_ID'), NAME: 'Example' }];
        else if (
          url.searchParams.has('TRADE_NAME') ||
          url.searchParams.get('MF_SRN') === 'US-MF-000000002'
        )
          value = [
            {
              PRIMARY_DI: '0001',
              TRADE_NAME: 'Example',
              MF_SRN: 'US-MF-000000002',
              AR_SRN: 'IT-AR-000000003',
            },
          ];
        return new Response(JSON.stringify({ value }));
      },
    });
    const result = await investigate(client, {
      manufacturerSrn: 'DE-MF-000000001',
      tradeName: 'Example',
    });
    expect(result.suppliedManufacturer?.devices?.records).toEqual([]);
    expect(result.candidates?.records[0].MF_SRN).toBe('US-MF-000000002');
    expect(result.discoveredManufacturers[0].srn).toBe('US-MF-000000002');
    expect(result.authorisedRepresentatives[0].srn).toBe('IT-AR-000000003');
    expect(calls.find((x) => x.searchParams.has('TRADE_NAME'))?.searchParams.has('MF_SRN')).toBe(
      false,
    );
    expect(result.evidence[0].documents.declarationOfConformity.status).toBe('unverified');
  });
  it('retains failures as failures rather than empty searches', async () => {
    const client = new EudamedClient(
      { ...readConfig({}), maxRetries: 0 },
      { fetch: async () => new Response('', { status: 503 }) },
    );
    const result = await investigate(client, { tradeName: 'Example' });
    expect(result.status).toBe('partial');
    expect(result.candidates).toBeNull();
    expect(result.failures.length).toBeGreaterThan(0);
  });
});

describe('investigation limits', () => {
  it('reports omitted manufacturers, representatives and locally truncated queries', async () => {
    const records = [1, 2, 3].map((i) => ({
      PRIMARY_DI: `000${i}`,
      TRADE_NAME: 'Example',
      MF_SRN: `US-MF-00000000${i}`,
      AR_SRN: `IT-AR-00000000${i}`,
    }));
    const client = new EudamedClient(readConfig({}), {
      fetch: async (input) => {
        const url = new URL(String(input));
        const value = url.pathname.endsWith('/reference')
          ? references
          : url.pathname.endsWith('/actors')
            ? [{ ACTOR_ID: url.searchParams.get('ACTOR_ID') }]
            : url.searchParams.has('TRADE_NAME')
              ? records
              : records.filter((row) => row.MF_SRN === url.searchParams.get('MF_SRN'));
        return new Response(JSON.stringify({ value }));
      },
    });
    const result = await investigate(client, {
      tradeName: 'Example',
      maxDevices: 2,
      maxManufacturers: 1,
      maxRepresentatives: 1,
    });
    expect(result.candidates?.provenance.truncated).toBe(true);
    expect(result.limits.omittedManufacturers).toBe(1);
    expect(result.limits.omittedRepresentatives).toBe(1);
    expect(result.limits.locallyTruncatedQueries).toHaveLength(1);
    expect(result.evidence).toHaveLength(2);
    expect(result.discoveredManufacturers).toHaveLength(1);
    expect(result.authorisedRepresentatives).toHaveLength(1);
  });
  it('supports manufacturer-only investigations without inventing an identity search', async () => {
    const client = new EudamedClient(readConfig({}), {
      fetch: async (input) =>
        new Response(
          JSON.stringify({
            value: String(input).includes('/udi')
              ? [{ PRIMARY_DI: '0001', MF_SRN: 'US-MF-000000001' }]
              : [],
          }),
        ),
    });
    const result = await investigate(client, { manufacturerSrn: 'US-MF-000000001' });
    expect(result.candidates).toBeNull();
    expect(result.targetEvidence).toHaveLength(0);
    expect(result.portfolioEvidence).toHaveLength(1);
    expect(result.discoveredManufacturers).toEqual([]);
  });
});
