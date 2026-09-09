import type { ProducerResult } from '../src/index.js';
export const ok = <T>(value: T): ProducerResult<T, never> => ({ ok: true, value });
export const err = <E>(error: E): ProducerResult<never, E> => ({ ok: false, error });
