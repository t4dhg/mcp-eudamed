import type { EudamedClient } from './client.js';
import { actorRecordSchema, deviceSchema } from './schemas.js';
import { checkSignal, type RequestOptions } from './cancellation.js';
import { EudamedError, errorMessage, devicePortalUrl } from './errors.js';
// Public historical positive control, observed 2026-11-09. Disappearance is not proof of outage.
const basicUdi = '506071773DERM-DX-CEMDRXU';
const actorId = 'GB-MF-000017972';
export async function checkStatus(client: EudamedClient, options: RequestOptions = {}) {
  const request = { ...options, bypassCache: true };
  async function probe(endpoint: 'udi' | 'actors') {
    checkSignal(options.signal);
    try {
      const result =
        endpoint === 'udi'
          ? await client.http.get('udi', { BASIC_UDI: basicUdi }, deviceSchema, request)
          : await client.http.get('actors', { ACTOR_ID: actorId }, actorRecordSchema, request);
      const matched = result.records.some((row) =>
        endpoint === 'udi'
          ? 'BASIC_UDI' in row && row.BASIC_UDI === basicUdi && row.MF_SRN === actorId
          : 'ACTOR_ID' in row && row.ACTOR_ID === actorId,
      );
      return {
        endpoint,
        status: 200,
        matched,
        sourceUrl: result.sourceUrl,
        retrievedAt: result.retrievedAt,
        cacheHit: result.cacheHit,
        error: null,
        details: null,
      };
    } catch (error) {
      checkSignal(options.signal);
      return {
        endpoint,
        status: error instanceof EudamedError ? (error.status ?? null) : null,
        matched: false,
        error: errorMessage(error),
        details: error instanceof EudamedError ? (error.details ?? null) : null,
      };
    }
  }
  const device = await probe('udi');
  const actors = await probe('actors');
  const probableOutage =
    device.status === 404 &&
    device.details?.responseBody.trim() === 'Data not found' &&
    !device.details.bodyReadFailed &&
    !device.details.bodyTruncated &&
    actors.status === 200 &&
    actors.matched;
  return {
    status: probableOutage
      ? 'probable-device-dataset-outage'
      : device.matched && actors.matched
        ? 'available'
        : 'inconclusive',
    probes: { device, actors },
    canary: { basicUdi, manufacturerSrn: actorId, lastKnownGood: '2026-11-09' },
    manualSearchUrl: devicePortalUrl,
    interpretation: probableOutage
      ? 'Probable upstream device dataset outage: the historical device control returned 404 Data not found while its actor control succeeded. Not proof: the control may have changed. Failed queries cannot establish absence.'
      : 'Availability applies only to these controls at observation time. Missing or failed controls are inconclusive; registry coverage and certificate status remain unknown.',
  };
}
