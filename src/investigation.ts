import { parseDeviceIdentifier, emptySearchSteps } from './identifiers.js';
import {
  EudamedClient,
  normalized,
  parameterNames,
  type Result,
  type Provenance,
} from './client.js';
import { normalizeDevice } from './evidence.js';
import { EudamedError, errorMessage } from './errors.js';
import { checkSignal, type RequestOptions } from './cancellation.js';
import {
  investigationSchema,
  searchKeys,
  type Actor,
  type Device,
  type InvestigationInput,
} from './schemas.js';
import { renderReport } from './report.js';
export interface Conflict {
  primaryDi: string | null;
  field: string;
  supplied: string;
  observed: string | null;
}
export interface SearchObservation {
  field: string;
  value: string;
  result: Result<Device> | null;
}
export const deviceKey = (record: Device) =>
  JSON.stringify([
    record.UUID ?? record.ID ?? record.PRIMARY_DI ?? record.BASIC_UDI,
    record.MF_SRN,
    record.VERSION_NUMBER ?? null,
  ]);
export async function investigate(
  client: EudamedClient,
  input: InvestigationInput,
  request: RequestOptions = {},
) {
  const options = investigationSchema.parse(input);
  const identifier = options.primaryDi ? parseDeviceIdentifier(options.primaryDi) : null;
  if (identifier) options.primaryDi = identifier.primaryDi;
  const deadline = new AbortController();
  const timer = setTimeout(
    () => deadline.abort(new EudamedError('DEADLINE', 'Investigation deadline exceeded')),
    options.deadlineMs,
  );
  const signal = request.signal
    ? AbortSignal.any([request.signal, deadline.signal])
    : deadline.signal;
  try {
    return { ...(await runInvestigation(client, options, signal)), identifier };
  } finally {
    clearTimeout(timer);
  }
}
async function runInvestigation(
  client: EudamedClient,
  options: ReturnType<typeof investigationSchema.parse>,
  signal: AbortSignal,
) {
  const failures: { step: string; error: string }[] = [];
  async function attempt<T>(step: string, run: () => Promise<T>): Promise<T | null> {
    if (signal.aborted) return null;
    try {
      checkSignal(signal);
      return await run();
    } catch (error) {
      failures.push({ step, error: errorMessage(error) });
      return null;
    }
  }
  const request = { signal };
  async function manufacturer(srn: string) {
    const actor = await attempt(`actor:${srn}`, () => client.actors({ actorId: srn }, request));
    const devices = await attempt(`manufacturer-devices:${srn}`, () =>
      client.devices({ manufacturerSrn: srn, exact: true, limit: options.maxDevices }, request),
    );
    return { srn, actor, devices };
  }
  // Each identity route is independent: an outdated name must not suppress an exact UDI.
  const searches: SearchObservation[] = [];
  for (const field of ['primaryDi', 'basicUdi', 'tradeName', 'deviceName', 'reference'] as const) {
    if (!options[field] || signal.aborted) continue;
    const result = await attempt(`device-search:${field}`, () =>
      client.devices({ [field]: options[field], exact: true, limit: options.maxDevices }, request),
    );
    searches.push({ field, value: options[field]!, result });
  }
  const hasIdentity = searchKeys.some((k) => k !== 'manufacturerSrn' && options[k]);
  const strongest = searches.find((s) => s.result?.records.length);
  const candidates = strongest?.result ?? searches.find((s) => s.result !== null)?.result ?? null;
  const targetRecords = candidates?.records ?? [];
  const conflicts: Conflict[] = [];
  for (const row of targetRecords)
    for (const field of searchKeys) {
      if (options[field] && normalized(row[parameterNames[field]]) !== normalized(options[field]))
        conflicts.push({
          primaryDi: row.PRIMARY_DI ?? null,
          field,
          supplied: options[field]!,
          observed:
            typeof row[parameterNames[field]] === 'string'
              ? (row[parameterNames[field]] as string)
              : null,
        });
    }
  const suppliedManufacturer =
    options.manufacturerSrn && !signal.aborted ? await manufacturer(options.manufacturerSrn) : null;
  const srns = [
    ...new Set(
      targetRecords
        .map((r) => r.MF_SRN?.trim())
        .filter((s): s is string => !!s && normalized(s) !== normalized(options.manufacturerSrn)),
    ),
  ];
  const discoveredManufacturers: Awaited<ReturnType<typeof manufacturer>>[] = [];
  for (const srn of srns.slice(0, options.maxManufacturers)) {
    if (signal.aborted) break;
    discoveredManufacturers.push(await manufacturer(srn));
  }
  const portfolios = [
    suppliedManufacturer?.devices,
    ...discoveredManufacturers.map((m) => m.devices),
  ].filter((v) => v != null);
  const targetKeys = new Set(targetRecords.map(deviceKey));
  const portfolioRecords = new Map<string, { record: Device; source: Provenance }>();
  for (const result of portfolios)
    for (const record of result.records) {
      const key = deviceKey(record);
      if (!targetKeys.has(key) && !portfolioRecords.has(key))
        portfolioRecords.set(key, { record, source: result.provenance });
    }
  const selectedPortfolio = [...portfolioRecords.values()].slice(0, options.maxDevices);
  const representativeRecords = targetRecords.length
    ? targetRecords
    : !hasIdentity
      ? selectedPortfolio.map((r) => r.record)
      : [];
  const representatives = [
    ...new Set(representativeRecords.map((r) => r.AR_SRN?.trim()).filter((s): s is string => !!s)),
  ];
  const authorisedRepresentatives: { srn: string; actor: Result<Actor> | null }[] = [];
  for (const srn of representatives.slice(0, options.maxRepresentatives)) {
    if (signal.aborted) break;
    authorisedRepresentatives.push({
      srn,
      actor: await attempt(`representative:${srn}`, () => client.actors({ actorId: srn }, request)),
    });
  }
  const references = await attempt('references', () =>
    client.referenceData(options.language, request),
  );
  const targetEvidence = targetRecords.map((record) => ({
    ...normalizeDevice(record, references?.records ?? []),
    source: candidates!.provenance,
  }));
  const portfolioEvidence = selectedPortfolio.map(({ record, source }) => ({
    ...normalizeDevice(record, references?.records ?? []),
    source,
  }));
  const alternatives = new Map<string, { record: Device; source: Provenance }>();
  for (const search of searches)
    for (const record of search.result?.records ?? [])
      if (!targetKeys.has(deviceKey(record)))
        alternatives.set(deviceKey(record), { record, source: search.result!.provenance });
  const unresolved: string[] = [];
  if (targetRecords.some((r) => !r.MF_SRN?.trim()))
    unresolved.push('One or more target records lack a manufacturer SRN.');
  if (targetRecords.some((r) => !r.AR_SRN?.trim()))
    unresolved.push(
      'One or more target records lack an authorised representative SRN; applicability is unverified.',
    );
  for (const m of [suppliedManufacturer, ...discoveredManufacturers])
    if (m?.actor && m.actor.records.length === 0)
      unresolved.push(`No actor matched manufacturer SRN ${m.srn}.`);
  for (const a of authorisedRepresentatives)
    if (a.actor && a.actor.records.length === 0)
      unresolved.push(`No actor matched representative SRN ${a.srn}.`);
  const identityStatus = !hasIdentity
    ? 'portfolio-only'
    : conflicts.length
      ? 'conflicting'
      : targetRecords.length > 1
        ? 'ambiguous'
        : targetRecords.length === 1
          ? strongest?.field === 'primaryDi'
            ? 'identifier-match'
            : 'candidate'
          : failures.length || signal.aborted
            ? 'unresolved'
            : 'not-found';
  const status = signal.aborted
    ? signal.reason instanceof EudamedError && signal.reason.code === 'DEADLINE'
      ? 'timed-out'
      : 'cancelled'
    : failures.length
      ? 'partial'
      : 'completed';
  const result = {
    status,
    identityStatus,
    scope: options,
    searches,
    candidates,
    suppliedManufacturer,
    discoveredManufacturers,
    authorisedRepresentatives,
    targetEvidence,
    portfolioEvidence,
    // Compatibility alias now deliberately contains target evidence only.
    evidence: targetEvidence,
    conflicts,
    unresolved,
    alternativeCandidates: [...alternatives.values()].slice(0, options.maxDevices),
    referenceProvenance: references?.provenance ?? null,
    failures,
    limits: {
      omittedManufacturers: Math.max(0, srns.length - discoveredManufacturers.length),
      omittedRepresentatives: Math.max(
        0,
        representatives.length - authorisedRepresentatives.length,
      ),
      omittedEvidenceRecords: Math.max(0, portfolioRecords.size - selectedPortfolio.length),
      omittedAlternativeCandidates: Math.max(0, alternatives.size - options.maxDevices),
      locallyTruncatedQueries: [...searches.map((s) => s.result), ...portfolios]
        .filter((r): r is Result<Device> => r != null && r.provenance.truncated)
        .map((r) => r.provenance.sourceUrl),
      incompletePaginationQueries: [
        ...searches.map((s) => s.result?.provenance),
        ...portfolios.map((r) => r.provenance),
        suppliedManufacturer?.actor?.provenance,
        ...discoveredManufacturers.map((m) => m.actor?.provenance),
        ...authorisedRepresentatives.map((a) => a.actor?.provenance),
        references?.provenance,
      ]
        .filter((p): p is Provenance => p != null && !p.pagination.complete)
        .map((p) => p.sourceUrl),
      upstreamCoverage: 'unknown',
    },
    nextSteps: targetRecords.length ? [] : emptySearchSteps,
    interpretation:
      'Execution status does not establish conformity. targetEvidence follows the strongest nonempty identity route; portfolioEvidence is company context only. Other route candidates and conflicts remain unresolved. Missing documents, missing actors and empty searches are not proof of non-compliance.',
  };
  return { ...result, report: renderReport(result) };
}
