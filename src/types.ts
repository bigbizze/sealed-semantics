import type { z } from 'zod';
import type { ValueMap, ValueSet } from './collections.js';
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type ProducerResult<T, E = ValueError> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };
export interface ValueError {
  readonly kind: string;
  readonly reason: 'invalid_wire' | 'invalid_parts' | 'invalid_input';
  readonly issues: readonly string[];
}
/** An impossible requirement that explains an invalid configuration in compiler errors. */
export type ConfigurationError<Message extends string> = {
  readonly [Explanation in Message]: never;
};
declare const BRAND: unique symbol;
export interface Proof<K extends string> {
  readonly [BRAND]: K;
  equals(other: Proof<K>): boolean;
  debug(): string;
  toJSON(): never;
  valueOf(): never;
  [Symbol.toPrimitive](): never;
}
export interface Value<K extends string, R> extends Proof<K> {
  encode(): R;
}
export interface AnyKind {
  readonly kind: string;
  is(x: unknown): x is Proof<string>;
}
export type ValueOf<
  Kd extends
    | AnyKind
    | {
        readonly 'ValueOf requires a completed kind. Call .seal() on the definition first.': never;
      },
> = Kd extends { is(x: unknown): x is infer V } ? V : never;
type Views<O> = O extends { view: infer F }
  ? keyof F extends never
    ? {}
    : {
        readonly view: {
          readonly [N in keyof F]: F[N] extends (...a: any[]) => infer R ? R : never;
        };
      }
  : {};
type Canonical<O> = O extends { canonical: (...args: any[]) => infer C }
  ? { canonical(): C }
  : {};
export type SemanticValue<K extends string, W extends z.ZodType, O> = Value<
  K,
  z.input<W>
> &
  Views<O> &
  Canonical<O>;
export type DerivedValue<K extends string, O> = Proof<K> & Views<O>;
export type ValueKind<K extends string, W extends z.ZodType, O> = Readonly<
  {
    readonly kind: K;
    is(x: unknown): x is SemanticValue<K, W, O>;
    parse(input: unknown): ProducerResult<SemanticValue<K, W, O>>;
    /** Return the sealed value, or throw a TypeError with the ValueError as cause. */
    parseOrThrow(input: unknown): SemanticValue<K, W, O>;
    readonly codec: z.ZodCodec<
      W,
      z.ZodType<SemanticValue<K, W, O>, SemanticValue<K, W, O>>
    >;
    map<V>(): ValueMap<ValueKind<K, W, O>, V>;
    set(): ValueSet<ValueKind<K, W, O>>;
  } & (O extends { allocate: (...args: infer A) => unknown }
    ? { allocate(...args: A): ProducerResult<SemanticValue<K, W, O>> }
    : {})
>;
export type DerivedKind<K extends string, I, O> = Readonly<{
  readonly kind: K;
  is(x: unknown): x is DerivedValue<K, O>;
  derive(input: I): ProducerResult<DerivedValue<K, O>>;
  map<V>(): ValueMap<DerivedKind<K, I, O>, V>;
  set(): ValueSet<DerivedKind<K, I, O>>;
}>;
export type JsonSchema<W extends z.ZodType> = 0 extends 1 & z.input<W>
  ? ConfigurationError<'Wire schema input must not be any. Use a schema with a specific JSON input type.'>
  : [z.input<W>] extends [JsonValue]
    ? W
    : ConfigurationError<'Wire schema input must be JSON-compatible. Encode dates, bigints, and other non-JSON values as JSON wire data.'>;
export type LiteralKind<K extends string> = K &
  (string extends K
    ? ConfigurationError<'kind must be a string literal, not a widened string. Use a literal or as const.'>
    : unknown);

export type ReservedField =
  | 'docs'
  | 'documentation'
  | 'view'
  | 'map'
  | 'set'
  | 'get'
  | 'value'
  | 'kind'
  | 'is'
  | 'parse'
  | 'parseOrThrow'
  | 'derive'
  | 'wire'
  | 'schema'
  | 'codec'
  | 'seal'
  | 'allocate'
  | 'canonical'
  | 'encode'
  | 'equals'
  | 'debug'
  | 'parts'
  | 'raw'
  | 'unwrap'
  | 'fromParts'
  | 'indexKey'
  | '__proto__'
  | 'constructor'
  | 'prototype'
  | 'then'
  | 'toJSON'
  | 'valueOf'
  | 'toString';
export type CheckedView<F> = F & {
  [
    N in Extract<keyof F, ReservedField>
  ]: ConfigurationError<`Field name "${N}" is reserved. Choose a different projection name.`>;
} & {
  [
    N in Extract<keyof F, symbol>
  ]: ConfigurationError<'Symbol-named projections are not supported. Use a string projection name.'>;
};

/** Examples are validated when .seal() is called; they do not configure the producer. */
export type ProjectionDocumentation<O> = Readonly<{ description?: string }> &
  (O extends { view: infer F }
    ? keyof F extends never
      ? {}
      : {
          readonly view: {
            readonly [N in keyof F]: Readonly<{
              description: string;
              example?: F[N] extends (...args: any[]) => infer R ? R : never;
            }>;
          };
        }
    : {});
export type DerivedDocumentation<O> = ProjectionDocumentation<O>;
export type ValueExample<W extends z.ZodType, O> = Readonly<{
  input: z.input<W>;
  encoded: z.input<W>;
}> &
  (O extends { canonical: (...args: any[]) => infer C }
    ? Readonly<{ canonical: C }>
    : {});
export type ValueDocumentation<W extends z.ZodType, O> = ProjectionDocumentation<O> &
  Readonly<{
    examples: readonly [ValueExample<W, O>, ...ValueExample<W, O>[]];
  }>;

type DocumentationMessage<N> = N extends 'exampleCanonical' | 'exampleWire'
  ? 'Separate exampleWire/exampleCanonical fields were replaced by examples: [{ input, encoded, canonical }].'
  : N extends 'examples'
    ? 'Derived definitions have no wire examples. Remove examples.'
    : N extends 'view'
      ? 'docs.view requires declared projections. Add projections to .view({ ... }) first.'
      : N extends 'views'
        ? 'The docs.views property was renamed to view. Use .docs({ view: ... }).'
        : N extends string
          ? `Unknown documentation property "${N}". Check the documentation property name.`
          : 'Symbol-named documentation properties are not supported.';
type ExampleAt<A> = A extends { readonly examples: readonly (infer E)[] } ? E : {};
type CheckedExample<P, A> = P & {
  [N in Exclude<keyof P, keyof A>]: ConfigurationError<
    N extends 'canonical'
      ? 'Example canonical requires canonical in defineKind(...). Add canonical or remove the example canonical.'
      : 'Unknown example property. Use input, encoded, and canonical when configured.'
  >;
};
type DocumentationInput<P, A> = A &
  Record<keyof P, unknown> &
  ('examples' extends keyof A
    ? { examples: readonly (ExampleAt<A> & Record<keyof ExampleAt<P>, unknown>)[] }
    : unknown);
export type CheckedDocumentation<Provided, Allowed> = Provided & {
  [N in Exclude<keyof Provided, keyof Allowed>]: ConfigurationError<
    DocumentationMessage<N>
  >;
} & (Provided extends { view: infer V }
    ? Allowed extends { readonly view: infer A }
      ? {
          view: V & {
            [N in Exclude<keyof V, keyof A>]: ConfigurationError<
              N extends string
                ? `Unknown documented projection "${N}". Declare it in .view({ ... }) first.`
                : 'Symbol-named documented projections are not supported.'
            >;
          };
        }
      : unknown
    : unknown) &
  (Provided extends { examples: infer E extends readonly unknown[] }
    ? 'examples' extends keyof Allowed
      ? { examples: { [I in keyof E]: CheckedExample<E[I], ExampleAt<Allowed>> } }
      : unknown
    : unknown);

type Documented<T, D> = D extends undefined ? T : T & { readonly documentation: D };
/** Configuration only. Call .seal() to create the completed kind. */
export interface ValueBuilder<
  K extends string,
  W extends z.ZodType,
  P,
  O = {},
  D = undefined,
> {
  readonly view: <const F extends Record<string, (parts: P) => unknown>>(
    projections: CheckedView<F>,
  ) => ValueBuilder<K, W, P, Omit<O, 'view'> & { view: F }>;
  readonly docs: <const M extends DocumentationInput<M, ValueDocumentation<W, O>>>(
    metadata: CheckedDocumentation<M, ValueDocumentation<W, O>>,
  ) => Omit<ValueBuilder<K, W, P, O, ValueDocumentation<W, O>>, 'view'>;
  readonly seal: () => Documented<ValueKind<K, W, O>, D>;
}
/** Configuration only. Call .seal() to create the completed kind. */
export interface DerivedBuilder<K extends string, I, P, O = {}, D = undefined> {
  readonly view: <const F extends Record<string, (parts: P) => unknown>>(
    projections: CheckedView<F>,
  ) => DerivedBuilder<K, I, P, Omit<O, 'view'> & { view: F }>;
  readonly docs: <const M extends DocumentationInput<M, DerivedDocumentation<O>>>(
    metadata: CheckedDocumentation<M, DerivedDocumentation<O>>,
  ) => Omit<DerivedBuilder<K, I, P, O, DerivedDocumentation<O>>, 'view'>;
  readonly seal: () => Documented<DerivedKind<K, I, O>, D>;
}
