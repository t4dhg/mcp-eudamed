import { EudamedError } from './errors.js';
export interface RequestOptions {
  signal?: AbortSignal;
}
export function cancellationError(signal: AbortSignal): EudamedError {
  return signal.reason instanceof EudamedError
    ? signal.reason
    : new EudamedError('CANCELLED', 'EUDAMED operation cancelled');
}
export function checkSignal(signal?: AbortSignal): void {
  if (signal?.aborted) throw cancellationError(signal);
}
/** Detach promptly from queued work; the queued operation must also check its signal before I/O. */
export function abortable<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  return new Promise((resolve, reject) => {
    const abort = () => reject(cancellationError(signal));
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) {
      signal.removeEventListener('abort', abort);
      abort();
    }
  });
}
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    checkSignal(signal);
    const abort = () => {
      clearTimeout(timer);
      reject(cancellationError(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
