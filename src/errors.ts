export const devicePortalUrl = 'https://ec.europa.eu/tools/eudamed/#/screen/search-device';
export interface HttpDetails {
  sourceUrl: string;
  retrievedAt: string;
  responseBody: string;
  bodyTruncated: boolean;
  bodyReadFailed: boolean;
}
export class EudamedError extends Error {
  constructor(
    public readonly code:
      'CANCELLED' | 'DEADLINE' | 'HTTP' | 'NETWORK' | 'TIMEOUT' | 'SCHEMA' | 'SIZE' | 'JSON',
    message: string,
    public readonly status?: number,
    public readonly retryable = false,
    public readonly details?: HttpDetails,
  ) {
    super(message);
    this.name = 'EudamedError';
  }
}
export function errorMessage(error: unknown): string {
  return error instanceof EudamedError
    ? error.message
    : 'Invalid input or unexpected integration error; check parameters and server configuration.';
}
