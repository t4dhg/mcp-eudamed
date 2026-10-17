export class EudamedError extends Error {
  constructor(
    public readonly code:
      'CANCELLED' | 'DEADLINE' | 'HTTP' | 'NETWORK' | 'TIMEOUT' | 'SCHEMA' | 'SIZE' | 'JSON',
    message: string,
    public readonly status?: number,
    public readonly retryable = false,
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
