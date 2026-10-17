import { z } from 'zod';
const positive = (fallback: number, max: number) =>
  z.coerce.number().int().min(1).max(max).default(fallback);
const schema = z.object({
  EUDAMED_BASE_URL: z
    .string()
    .url()
    .default('https://api.datalake.sante.service.ec.europa.eu/eudamed')
    .refine((value) => {
      const u = new URL(value);
      return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash;
    }, 'Base URL must be HTTPS without credentials, query or fragment'),
  EUDAMED_API_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/)
    .default('v1.0'),
  EUDAMED_MAX_PAGES: positive(10, 50),
  EUDAMED_TIMEOUT_MS: positive(15000, 120000),
  EUDAMED_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(2),
  EUDAMED_CACHE_TTL_MS: z.coerce.number().int().min(0).max(86400000).default(60000),
  EUDAMED_REFERENCE_TTL_MS: z.coerce.number().int().min(0).max(86400000).default(3600000),
  EUDAMED_MAX_RESPONSE_BYTES: positive(10000000, 50000000),
});
export function readConfig(env: Record<string, string | undefined> = process.env) {
  const c = schema.parse(env);
  return {
    baseUrl: c.EUDAMED_BASE_URL.replace(/\/$/, ''),
    apiVersion: c.EUDAMED_API_VERSION,
    timeoutMs: c.EUDAMED_TIMEOUT_MS,
    maxPages: c.EUDAMED_MAX_PAGES,
    maxRetries: c.EUDAMED_MAX_RETRIES,
    cacheTtlMs: c.EUDAMED_CACHE_TTL_MS,
    referenceTtlMs: c.EUDAMED_REFERENCE_TTL_MS,
    maxResponseBytes: c.EUDAMED_MAX_RESPONSE_BYTES,
  };
}
export type Config = ReturnType<typeof readConfig>;
