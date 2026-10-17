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
  searchKeys,
  type DeviceSearch,
} from './schemas.js';
export const parameterNames = {
  manufacturerSrn: 'MF_SRN',
  tradeName: 'TRADE_NAME',
  deviceName: 'DEVICE_NAME',
  basicUdi: 'BASIC_UDI',
  primaryDi: 'PRIMARY_DI',
  reference: 'REFERENCE',
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
        truncated: matches.length > limit,
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
    const query: Record<string, string> = {};
    for (const key of searchKeys) if (search[key]) query[parameterNames[key]] = search[key]!;
    const result = await this.http.get('udi', query, deviceSchema, options);
    const matches = search.exact
      ? result.records.filter((row) =>
          searchKeys.every(
            (key) =>
              !search[key] || normalized(row[parameterNames[key]]) === normalized(search[key]),
          ),
        )
      : result.records;
    return {
      ...this.result(result, matches, search.limit),
      identifier,
      nextSteps: matches.length ? [] : emptySearchSteps,
    };
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
