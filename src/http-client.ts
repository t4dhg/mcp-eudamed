import {
  abortable,
  checkSignal,
  delay,
  cancellationError,
  type RequestOptions,
} from './cancellation.js';
import { z } from 'zod';
import type { Config } from './config.js';
import { EudamedError } from './errors.js';
export interface Dependencies {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}
export interface Pagination {
  pagesFetched: number;
  complete: boolean;
  pageUrls: string[];
}
export interface Observation<T> {
  pagination: Pagination;
  records: T[];
  sourceUrl: string;
  retrievedAt: string;
  cacheHit: boolean;
}
interface CacheEntry {
  pagination: Pagination;
  records: unknown[];
  retrievedAt: string;
  expires: number;
}
export class HttpClient {
  private cache = new Map<string, CacheEntry>();
  private tail: Promise<unknown> = Promise.resolve();
  private fetcher: typeof fetch;
  private sleep?: (ms: number) => Promise<void>;
  private now: () => number;
  constructor(
    readonly config: Config,
    deps: Dependencies = {},
  ) {
    this.fetcher = deps.fetch ?? fetch;
    this.sleep = deps.sleep;
    this.now = deps.now ?? Date.now;
  }
  clearCache() {
    this.cache.clear();
  }
  async get<T>(
    endpoint: 'udi' | 'actors' | 'reference',
    query: Record<string, string>,
    record: z.ZodType<T>,
    options: RequestOptions = {},
  ): Promise<Observation<T>> {
    checkSignal(options.signal);
    const url = new URL(`${this.config.baseUrl}/${endpoint}`);
    for (const key of Object.keys(query).sort()) url.searchParams.set(key, query[key]);
    url.searchParams.set('format', 'json');
    url.searchParams.set('api-version', this.config.apiVersion);
    const key = url.toString();
    // Serialize requests, including retries, to avoid bursts against the public service.
    const operation = this.tail.then(async () => {
      checkSignal(options.signal);
      const cached = this.cache.get(key);
      if (cached && cached.expires > this.now())
        return {
          records: structuredClone(cached.records) as T[],
          sourceUrl: key,
          retrievedAt: cached.retrievedAt,
          cacheHit: true,
          pagination: structuredClone(cached.pagination),
        };
      const records: T[] = [];
      const pageUrls: string[] = [];
      let next: string | undefined = key;
      while (next && pageUrls.length < this.config.maxPages) {
        if (pageUrls.includes(next)) throw new EudamedError('SCHEMA', 'Repeated continuation link');
        pageUrls.push(next);
        const page = await this.request(next, record, options.signal);
        records.push(...page.value);
        if (records.length > 10000)
          throw new EudamedError(
            'SIZE',
            'Combined response exceeds 10000 records; narrow the query',
          );
        next = undefined;
        if (page.nextLink) {
          let link: URL;
          try {
            link = new URL(page.nextLink);
          } catch {
            throw new EudamedError('SCHEMA', 'Invalid continuation link');
          }
          if (
            link.origin !== url.origin ||
            link.pathname !== url.pathname ||
            link.username ||
            link.password ||
            link.hash
          )
            throw new EudamedError('SCHEMA', 'Unsafe continuation link');
          for (const [name, value] of url.searchParams)
            if (link.searchParams.get(name) !== value)
              throw new EudamedError('SCHEMA', 'Changed query in continuation link');
          next = link.toString();
          if (pageUrls.includes(next))
            throw new EudamedError('SCHEMA', 'Repeated continuation link');
        }
      }
      const pagination = { pagesFetched: pageUrls.length, complete: !next, pageUrls };
      const retrievedAt = new Date(this.now()).toISOString();
      const ttl = endpoint === 'reference' ? this.config.referenceTtlMs : this.config.cacheTtlMs;
      if (this.cache.size >= 32) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, {
        records: structuredClone(records),
        pagination,
        retrievedAt,
        expires: this.now() + ttl,
      });
      return { records, sourceUrl: key, retrievedAt, cacheHit: false, pagination };
    });
    this.tail = operation.catch(() => undefined);
    return abortable(operation, options.signal);
  }
  private async request<T>(
    url: string,
    record: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<{ value: T[]; nextLink?: string | null }> {
    for (let attempt = 0; ; attempt++) {
      checkSignal(signal);
      let retryDelay: number | undefined;
      const controller = new AbortController();
      const abort = () => controller.abort(signal?.reason);
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const response = await this.fetcher(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
          redirect: 'error',
        });
        if (!response.ok) {
          const retryable =
            response.status === 429 || [500, 502, 503, 504].includes(response.status);
          const retryAfter = response.headers.get('retry-after');
          if (retryAfter)
            retryDelay = /^\d+(\.\d+)?$/.test(retryAfter)
              ? Number(retryAfter) * 1000
              : Math.max(0, Date.parse(retryAfter) - this.now());
          await response.body?.cancel();
          throw new EudamedError(
            'HTTP',
            `EUDAMED returned HTTP ${response.status}`,
            response.status,
            retryable,
          );
        }
        if (Number(response.headers.get('content-length')) > this.config.maxResponseBytes) {
          await response.body?.cancel();
          throw new EudamedError(
            'SIZE',
            'EUDAMED response exceeds the configured byte limit; narrow the query',
          );
        }
        const reader = response.body?.getReader();
        if (!reader) throw new EudamedError('JSON', 'EUDAMED returned an empty response body');
        let size = 0;
        const chunks: Uint8Array[] = [];
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > this.config.maxResponseBytes) {
            await reader.cancel();
            throw new EudamedError(
              'SIZE',
              'EUDAMED response exceeds the configured byte limit; narrow the query',
            );
          }
          chunks.push(value);
        }
        let body: unknown;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          throw new EudamedError('JSON', 'EUDAMED returned invalid JSON');
        }
        const parsed = z
          .object({ value: z.array(record).max(10000), nextLink: z.string().nullable().optional() })
          .safeParse(body);
        if (!parsed.success)
          throw new EudamedError(
            'SCHEMA',
            'EUDAMED response schema changed or contained invalid records',
          );
        checkSignal(signal);
        return parsed.data;
      } catch (cause) {
        const error = signal?.aborted
          ? cancellationError(signal)
          : cause instanceof EudamedError
            ? cause
            : new EudamedError(
                controller.signal.aborted ? 'TIMEOUT' : 'NETWORK',
                controller.signal.aborted
                  ? 'EUDAMED request timed out'
                  : 'EUDAMED network request failed',
                undefined,
                true,
              );
        if (!error.retryable || attempt >= this.config.maxRetries) throw error;
        if (retryDelay !== undefined && Number.isFinite(retryDelay) && retryDelay > 30000)
          throw error; // Never retry earlier than a long upstream cooldown.
        clearTimeout(timer);
        const ms =
          retryDelay !== undefined && Number.isFinite(retryDelay)
            ? retryDelay
            : Math.min(1000 * 2 ** attempt, 10000) + Math.floor(Math.random() * 250);
        if (this.sleep) await abortable(this.sleep(ms), signal);
        else await delay(ms, signal);
      } finally {
        signal?.removeEventListener('abort', abort);
        clearTimeout(timer);
      }
    }
  }
}
