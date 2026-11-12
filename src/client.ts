import { checkStatus } from './status.js';
import { EudamedError } from './errors.js';
import { parseDeviceIdentifier, emptySearchSteps } from './identifiers.js';
import { discoverActors } from './discovery.js';
import type { RequestOptions } from './cancellation.js';
import { z } from 'zod';
import { readConfig, type Config } from './config.js';
import { HttpClient, type Dependencies, type Observation, type Pagination } from './http-client.js';
import {
  actorRecordSchema,
  discoverySchema,
  actorSchema,
  deviceSchema,
  referenceInputSchema,
  referenceSchema,
  searchSchema,
  deviceSearchKeys,
  type DeviceSearch,
} from './schemas.js';
export const parameterNames = {
  manufacturerSrn: 'MF_SRN',
  tradeName: 'TRADE_NAME',
  deviceName: 'DEVICE_NAME',
  basicUdi: 'BASIC_UDI',
  primaryDi: 'PRIMARY_DI',
  reference: 'REFERENCE',
  riskClass: 'RISK_CLASS_ID',
  applicableLegislationId: 'APPLICABLE_LEGISLATION_ID',
  nomenclatureCode: 'NOMENCLATURE_CODE',
  specialDeviceTypeId: 'SPECIAL_DEVICE_TYPE_ID',
} as const;
export function normalized(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
export interface Provenance {
  sourceUrl: string;
  retrievedAt: string;
  apiVersion: string;
  cacheHit: boolean;
  returnedByApi: number;
  matched: number;
  returned: number;
  truncated: boolean;
  locallyTruncated: boolean;
  coverage: 'unknown';
  pagination: Pagination;
  warnings: string[];
}
export interface Result<T> {
  records: T[];
  provenance: Provenance;
}
export class EudamedClient {
  readonly http: HttpClient;
  constructor(
    readonly config: Config = readConfig(),
    deps: Dependencies = {},
  ) {
    this.http = new HttpClient(config, deps);
  }
  private result<T>(observation: Observation<T>, matches: T[], limit: number): Result<T> {
    return {
      records: matches.slice(0, limit),
      provenance: {
        sourceUrl: observation.sourceUrl,
        retrievedAt: observation.retrievedAt,
        apiVersion: this.config.apiVersion,
        cacheHit: observation.cacheHit,
        returnedByApi: observation.records.length,
        matched: matches.length,
        returned: Math.min(matches.length, limit),
        truncated: matches.length > limit || !observation.pagination.complete,
        locallyTruncated: matches.length > limit,
        coverage: 'unknown',
        pagination: observation.pagination,
        warnings: [
          'Query pagination is separate from registry coverage and record freshness, which remain unknown.',
          ...(!observation.pagination.complete
            ? ['Configured page limit reached; more upstream results exist.']
            : []),
          ...(matches.length === 0
            ? ['No match in this response does not prove absence or non-compliance.']
            : []),
        ],
      },
    };
  }
  async devices(input: DeviceSearch, options: RequestOptions = {}) {
    const search = searchSchema.parse(input);
    const identifier = search.primaryDi ? parseDeviceIdentifier(search.primaryDi) : null;
    if (identifier) search.primaryDi = identifier.primaryDi;
    let filterReferenceProvenance: Provenance | null = null;
    if (typeof search.riskClass === 'string') {
      if (/^-?\d+$/.test(search.riskClass))
        search.riskClass = z.number().int().parse(Number(search.riskClass));
      else {
        const references = await this.referenceData('en', options);
        filterReferenceProvenance = references.provenance;
        if (references.provenance.truncated)
          throw new EudamedError(
            'SCHEMA',
            'Risk class reference data is incomplete; supply a verified numeric ID.',
          );
        const ids = new Set(
          references.records
            .filter(
              (r) =>
                r.CODE === 'RISK_CLASS_ID' && normalized(r.VALUE) === normalized(search.riskClass),
            )
            .map((r) => r.ID),
        );
        if (ids.size !== 1)
          throw new EudamedError(
            'SCHEMA',
            'Unknown or ambiguous risk class label; use eudamed_references with CODE=RISK_CLASS_ID and supply a numeric ID.',
          );
        search.riskClass = [...ids][0];
      }
    }
    const query: Record<string, string> = {};
    for (const key of deviceSearchKeys)
      if (search[key] !== undefined) query[parameterNames[key]] = String(search[key]);
    const result = await this.http.get('udi', query, deviceSchema, options);
    const matches = search.exact
      ? result.records.filter((row) =>
          deviceSearchKeys.every(
            (key) =>
              search[key] === undefined ||
              (typeof search[key] === 'number'
                ? row[parameterNames[key]] === search[key]
                : normalized(row[parameterNames[key]]) === normalized(search[key])),
          ),
        )
      : result.records;
    return {
      ...this.result(result, matches, search.limit),
      identifier,
      filterReferenceProvenance,
      nextSteps: matches.length ? [] : emptySearchSteps,
    };
  }
  async status(options: RequestOptions = {}) {
    return checkStatus(this, options);
  }
  async discoverActors(input: z.input<typeof discoverySchema>, options: RequestOptions = {}) {
    return discoverActors(this, input, options);
  }
  async actors(input: z.input<typeof actorSchema>, options: RequestOptions = {}) {
    const { actorId } = actorSchema.parse(input);
    const result = await this.http.get('actors', { ACTOR_ID: actorId }, actorRecordSchema, options);
    return this.result(
      result,
      result.records.filter((row) => normalized(row.ACTOR_ID) === normalized(actorId)),
      20,
    );
  }
  async references(input: z.input<typeof referenceInputSchema> = {}, options: RequestOptions = {}) {
    const { language, code, id, limit } = referenceInputSchema.parse(input);
    const result = await this.http.get(
      'reference',
      { LANGUAGE: language },
      referenceSchema,
      options,
    );
    return this.result(
      result,
      result.records.filter(
        (row) =>
          row.LANGUAGE === language &&
          (code === undefined || row.CODE === code) &&
          (id === undefined || row.ID === id),
      ),
      limit,
    );
  }
  async referenceData(language = 'en', options: RequestOptions = {}) {
    const validated = referenceInputSchema.parse({ language });
    const result = await this.http.get(
      'reference',
      { LANGUAGE: validated.language },
      referenceSchema,
      options,
    );
    return this.result(
      result,
      result.records.filter((row) => row.LANGUAGE === validated.language),
      10000,
    );
  }
}
