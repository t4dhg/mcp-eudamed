import type { normalizeDevice } from './evidence.js';
import type { Provenance } from './client.js';
interface ReportInput {
  status: string;
  identityStatus: string;
  targetEvidence: (ReturnType<typeof normalizeDevice> & { source: Provenance })[];
  portfolioEvidence: unknown[];
  conflicts: { field: string; supplied: string; observed: string | null }[];
  unresolved: string[];
  failures: { step: string; error: string }[];
  limits: {
    upstreamCoverage: string;
    omittedManufacturers: number;
    omittedRepresentatives: number;
    omittedEvidenceRecords: number;
    omittedAlternativeCandidates: number;
    locallyTruncatedQueries: string[];
    incompletePaginationQueries: string[];
  };
}
// Registry strings are rendered as escaped, bounded text, never Markdown instructions or links.
const safe = (value: unknown) =>
  String(value ?? 'unknown')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[\\`*_{}[\]()<>#!|]/g, '\\$&')
    .slice(0, 300);
export function renderReport(data: ReportInput): string {
  const lines = [
    `EUDAMED investigation — ${data.status}`,
    `Identity: ${data.identityStatus}. Upstream coverage: unknown.`,
    '',
  ];
  if (!data.targetEvidence.length)
    lines.push(
      'No target identity established. Portfolio records must not be attributed to the requested device.',
    );
  for (const item of data.targetEvidence) {
    lines.push(
      `- Target: ${safe(item.identity.tradeName ?? item.identity.deviceName)}; Primary DI: ${safe(item.identity.primaryDi)}; Basic UDI: ${safe(item.identity.basicUdi)}; model: ${safe(item.identity.model)}; version: ${safe(item.identity.version)}.`,
      `  Manufacturer: ${safe(item.manufacturer.name)} (${safe(item.manufacturer.srn)}); representative: ${safe(item.authorisedRepresentative.srn)}.`,
      `  Classification: ${safe(item.decoded.RISK_CLASS_ID?.label)}; legislation: ${safe(item.decoded.APPLICABLE_LEGISLATION_ID?.label)}.`,
      `  Intended purpose: ${item.intendedPurpose.status}. IFU, declaration, certificate and applicable conformity route: unverified.`,
      `  Observed: ${safe(item.source.retrievedAt)}; source query: ${safe(item.source.sourceUrl)}.`,
    );
  }
  lines.push(
    '',
    `Portfolio context: ${data.portfolioEvidence.length} records, separate from target evidence.`,
  );
  for (const c of data.conflicts)
    lines.push(
      `- Identity conflict (${safe(c.field)}): supplied “${safe(c.supplied)}”; record “${safe(c.observed)}”.`,
    );
  for (const note of data.unresolved) lines.push(`- Unresolved: ${safe(note)}`);
  for (const f of data.failures) lines.push(`- Failed step ${safe(f.step)}: ${safe(f.error)}`);
  lines.push(
    `Bounds: ${data.limits.incompletePaginationQueries.length} queries stopped at the page limit; ${data.limits.locallyTruncatedQueries.length} locally truncated queries; ${data.limits.omittedManufacturers} manufacturers, ${data.limits.omittedRepresentatives} representatives, ${data.limits.omittedEvidenceRecords} portfolio records and ${data.limits.omittedAlternativeCandidates} alternatives omitted.`,
    '',
    'Next evidence: obtain the exact-model controlled IFU and label, the EU declaration tied to the Basic UDI-DI, and establish the applicable conformity route before verifying any required certificate and schedule.',
    'Public registration is not a conformity verdict. Missing records or documents do not prove non-compliance.',
  );
  return lines.join('\n');
}
