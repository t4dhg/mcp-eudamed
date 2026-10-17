import { z } from 'zod';
import { normalized, type EudamedClient } from './client.js';
import { actorRecordSchema, discoverySchema, type Actor } from './schemas.js';
import { checkSignal, type RequestOptions } from './cancellation.js';
import { errorMessage } from './errors.js';
/** Documented Data Lake name filters are exact; the public portal supports broader discovery. */
export async function discoverActors(
  client: EudamedClient,
  input: z.input<typeof discoverySchema>,
  options: RequestOptions = {},
) {
  const query = discoverySchema.parse(input);
  const observations = [];
  const failures: { field: string; error: string }[] = [];
  const candidates = new Map<string, Actor>();
  for (const field of ['NAME', 'ABBREVIATED_NAME'] as const) {
    checkSignal(options.signal);
    try {
      const parameters: Record<string, string> = { [field]: query.name };
      if (query.country) parameters.ACT_COUNTRY_ISO2_CODE = query.country;
      if (query.role) parameters.ACTOR_TYPE = query.role;
      const result = await client.http.get('actors', parameters, actorRecordSchema, options);
      const matches = result.records.filter(
        (row) =>
          normalized(row[field]) === normalized(query.name) &&
          (!query.country || row.ACT_COUNTRY_ISO2_CODE === query.country) &&
          (!query.role || row.ACTOR_TYPE === query.role),
      );
      for (const row of matches)
        candidates.set(
          JSON.stringify([
            row.ACTOR_ID,
            row.NAME,
            row.ABBREVIATED_NAME,
            row.ACTOR_TYPE,
            row.STATUS,
            row.ACT_COUNTRY_ISO2_CODE,
          ]),
          row,
        );
      observations.push({
        field,
        sourceUrl: result.sourceUrl,
        retrievedAt: result.retrievedAt,
        cacheHit: result.cacheHit,
        pagination: result.pagination,
        returnedByApi: result.records.length,
        matched: matches.length,
      });
    } catch (error) {
      checkSignal(options.signal);
      failures.push({ field, error: errorMessage(error) });
    }
  }
  return {
    status:
      failures.length || observations.some((o) => !o.pagination.complete)
        ? 'partial'
        : candidates.size
          ? 'candidates'
          : 'not-found',
    candidates: [...candidates.values()].slice(0, query.limit),
    omittedCandidates: Math.max(0, candidates.size - query.limit),
    observations,
    failures,
    coverage: 'unknown',
    matching: 'exact-legal-or-abbreviated-name',
    portalUrl: `https://ec.europa.eu/tools/eudamed/#/screen/search-eo?name=${encodeURIComponent(query.name)}&submitted=true`,
    nextSteps: [
      'Confirm the registered legal name, country and role. Candidates are not automatic identity confirmations.',
      'For shortened or trading names, open portalUrl in a browser; the public portal supports partial-name search while these Data Lake filters require exact names.',
      'Use a verified manufacturer SRN with eudamed_investigate to retrieve its portfolio; never use the company name as manufacturerSrn.',
    ],
  };
}
