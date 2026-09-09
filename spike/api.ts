import type { z } from 'zod';
import type {
  ProducerResult,
  ValueOptions,
  ProjectionOptions,
  ValueKind,
  DerivedKind,
  JsonSchema,
  LiteralKind,
} from '../src/types.js';
export declare function defineValue<
  const K extends string,
  W extends z.ZodType,
  P,
>(spec: {
  kind: LiteralKind<K>;
  wire: W & JsonSchema<W>;
  decode: (w: z.output<W>) => ProducerResult<P>;
}): { with<const O extends ValueOptions<W, P>>(options: O): ValueKind<K, W, O> };
export declare function defineDerived<const K extends string, I, P>(spec: {
  kind: LiteralKind<K>;
  derive: (input: I) => ProducerResult<P>;
}): { with<const O extends ProjectionOptions<P>>(options: O): DerivedKind<K, I, O> };
export declare function ok<T>(value: T): ProducerResult<T, never>;
