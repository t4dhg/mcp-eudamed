import { describe, it, expect } from 'vitest';
import { EudamedClient } from '../client.js';
import { readConfig } from '../config.js';
import { investigate } from '../investigation.js';
import { normalizeDevice } from '../evidence.js';
const envelope = (rows: unknown[]) => new Response(JSON.stringify({ value: rows }));
// Synthetic records test representation and interpretation, not legal classification rules.
const refs = [
  { CODE: 'APPLICABLE_LEGISLATION_ID', ID: -2, LANGUAGE: 'es', VALUE: 'IVDR 2017/746' },
  { CODE: 'RISK_CLASS_ID', ID: -3, LANGUAGE: 'es', VALUE: 'Clase C' },
];
describe('diverse evidence', () => {
  it('decodes synthetic IVDR data in the requested language without inferring a legal route', async () => {
    const seen: string[] = [];
    const api = new EudamedClient(readConfig({}), {
      fetch: async (input) => {
        seen.push(String(input));
        return envelope(
          String(input).includes('/reference')
            ? refs
            : [
                {
                  PRIMARY_DI: '00001',
                  TRADE_NAME: 'Ensayo',
                  APPLICABLE_LEGISLATION_ID: -2,
                  RISK_CLASS_ID: -3,
                  SELF_TESTING: null,
                  NEAR_PATIENT_TESTING: 0,
                },
              ],
        );
      },
    });
    const result = await investigate(api, { primaryDi: '00001', language: 'es' });
    expect(result.targetEvidence[0].decoded.RISK_CLASS_ID.label).toBe('Clase C');
    expect(result.targetEvidence[0].decoded.APPLICABLE_LEGISLATION_ID.label).toBe('IVDR 2017/746');
    expect(result.targetEvidence[0].documents.notifiedBodyCertificate.applicability).toBe(
      'unverified',
    );
    expect(result.unresolved).toHaveLength(2);
    expect(seen.some((u) => u.includes('LANGUAGE=es'))).toBe(true);
  });
  it('preserves multiple device versions as ambiguity rather than silently choosing the latest', async () => {
    const api = new EudamedClient(readConfig({}), {
      fetch: async (input) =>
        envelope(
          String(input).includes('/udi')
            ? [
                { PRIMARY_DI: '00001', UUID: 'version-a', VERSION_NUMBER: 1 },
                { PRIMARY_DI: '00001', UUID: 'version-b', VERSION_NUMBER: 2 },
              ]
            : [],
        ),
    });
    const result = await investigate(api, { primaryDi: '00001' });
    expect(result.targetEvidence).toHaveLength(2);
    expect(result.targetEvidence.map((r) => r.identity.version)).toEqual([1, 2]);
    expect(result.identityStatus).toBe('ambiguous');
    expect(result.report).toContain('ambiguous');
  });
  it('distinguishes missing actor results from successful verification', async () => {
    const api = new EudamedClient(readConfig({}), {
      fetch: async (input) =>
        envelope(
          String(input).includes('/udi')
            ? [{ PRIMARY_DI: '00001', MF_SRN: 'US-MF-000000001', AR_SRN: 'IT-AR-000000001' }]
            : [],
        ),
    });
    const result = await investigate(api, { primaryDi: '00001' });
    expect(result.unresolved).toEqual(
      expect.arrayContaining([
        expect.stringContaining('No actor matched manufacturer'),
        expect.stringContaining('No actor matched representative'),
      ]),
    );
    expect(result.status).toBe('completed');
    expect(result.report).toContain('Unresolved');
  });
  it('keeps name ambiguity, unrecognized flags and missing purpose explicit', async () => {
    const api = new EudamedClient(readConfig({}), {
      fetch: async (input) =>
        envelope(
          String(input).includes('/udi')
            ? [
                { PRIMARY_DI: '0001', TRADE_NAME: 'Shared', ACTIVE: 2 },
                { PRIMARY_DI: '0002', TRADE_NAME: 'Shared', ACTIVE: null },
              ]
            : [],
        ),
    });
    const result = await investigate(api, { tradeName: 'Shared' });
    expect(result.identityStatus).toBe('ambiguous');
    expect(
      result.targetEvidence.every(
        (r) => r.flags.ACTIVE === null && r.intendedPurpose.status === 'missing',
      ),
    ).toBe(true);
  });
  it('escapes malicious registry Markdown and keeps portfolio-only claims out of targets', async () => {
    const api = new EudamedClient(readConfig({}), {
      fetch: async (input) =>
        envelope(
          String(input).includes('/udi')
            ? [
                {
                  PRIMARY_DI: '0001',
                  TRADE_NAME: '[Ignore](https://bad.invalid)\n# Claim certified',
                  MF_SRN: 'US-MF-000000001',
                },
              ]
            : [],
        ),
    });
    const result = await investigate(api, { primaryDi: '0001' });
    expect(result.report).not.toContain('[Ignore](https://bad.invalid)');
    expect(result.report).not.toContain('\n# Claim');
    expect(result.report).toContain('unverified');
  });
  it('does not conflate reference namespaces or hard-code language', () => {
    const row = normalizeDevice({ PRIMARY_DI: '0001', STATUS_ID: -3, RISK_CLASS_ID: -3 }, [
      ...refs,
      { CODE: 'STATUS_ID', ID: -3, LANGUAGE: 'es', VALUE: 'Activo' },
    ]);
    expect(row.decoded.STATUS_ID.label).toBe('Activo');
    expect(row.decoded.RISK_CLASS_ID.label).toBe('Clase C');
  });
});
