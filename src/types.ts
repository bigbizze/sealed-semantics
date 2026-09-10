import type { z } from 'zod';
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type ProducerResult<T, E = never> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };
/** An impossible requirement that explains an invalid configuration in compiler errors. */
export type ConfigurationError<Message extends string> = {
  readonly [Explanation in Message]: never;
};
declare const BRAND: unique symbol;
export interface Proof<K extends string> {
  readonly [BRAND]: K;
  debug(): string;
  toJSON(): never;
  valueOf(): never;
  [Symbol.toPrimitive](): never;
}
export interface AnyKind {
  readonly name: string;
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
          readonly [N in keyof F]: F[N] extends (...a: any[]) => infer R
            ? DeepReadonly<R>
            : never;
        };
      }
  : {};
/** An owned conversion removes readonly containers; built-in data keeps its type. */
export type Owned<T> = T extends Date | ArrayBuffer | ArrayBufferView
  ? T
  : T extends ReadonlyMap<infer K, infer V>
    ? Map<Owned<K>, Owned<V>>
    : T extends ReadonlySet<infer V>
      ? Set<Owned<V>>
      : T extends object
        ? { -readonly [K in keyof T]: Owned<T[K]> }
        : T;
type CopyCheck<T> = T extends
  Proof<string> | SharedArrayBuffer | symbol | ((...args: any[]) => any)
  ? never
  : T extends
        | Date
        | ArrayBuffer
        | Uint8Array
        | Int8Array
        | Uint8ClampedArray
        | Int16Array
        | Uint16Array
        | Int32Array
        | Uint32Array
        | Float32Array
        | Float64Array
        | BigInt64Array
        | BigUint64Array
        | DataView
    ? T
    : T extends ReadonlyMap<infer K, infer V>
      ? ReadonlyMap<CopyCheck<K>, CopyCheck<V>>
      : T extends ReadonlySet<infer V>
        ? ReadonlySet<CopyCheck<V>>
        : T extends WeakMap<any, any> | WeakSet<any> | Promise<any> | SharedArrayBuffer
          ? never
          : T extends object
            ? { [K in keyof T]: K extends symbol ? never : CopyCheck<T[K]> }
            : T;
type ConversionResult =
  | Date
  | ArrayBuffer
  | ArrayBufferView
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>;
export type CheckedConversions<F> = F & {
  [N in keyof F]: F[N] extends (...args: any[]) => infer R
    ? unknown extends R
      ? unknown
      : [R] extends [ConversionResult & CopyCheck<R>]
        ? unknown
        : ConfigurationError<'Conversions must return Date, Map, Set, ArrayBuffer, or a typed array/DataView. Use view for primitives, arrays, and plain objects; functions, sealed values, and shared memory cannot be copied.'>
    : unknown;
} & {
  [
    N in Extract<keyof F, 'then' | '__proto__' | 'constructor' | 'prototype' | 'toJSON'>
  ]: ConfigurationError<'This conversion name is reserved.'>;
} & {
  [
    N in Extract<keyof F, symbol>
  ]: ConfigurationError<'Symbol-named conversions are not supported.'>;
};
type Conversions<O> = O extends { to: infer F }
  ? keyof F extends never
    ? {}
    : {
        readonly to: {
          readonly [N in keyof F]: F[N] extends (...args: any[]) => infer R
            ? () => Owned<R>
            : never;
        };
      }
  : {};
export type SemanticValue<K extends string, W extends z.ZodType, O> = Proof<K> &
  Views<O> &
  Conversions<O>;
export type MintedValue<K extends string, O> = Proof<K> & Views<O> & Conversions<O>;
export type ValueKind<K extends string, W extends z.ZodType, O> = Readonly<
  {
    readonly name: K;
    is(x: unknown): x is SemanticValue<K, W, O>;
    readonly codec: z.ZodCodec<
      W,
      z.ZodType<SemanticValue<K, W, O>, SemanticValue<K, W, O>>
    >;
  } & (O extends { allocate: (...args: infer A) => unknown }
    ? { allocate(...args: A): SemanticValue<K, W, O> }
    : {})
>;
export type MintedKind<K extends string, I, E, O> = Readonly<{
  readonly name: K;
  is(x: unknown): x is MintedValue<K, O>;
  mint(input: I): ProducerResult<MintedValue<K, O>, E>;
}>;
export type JsonSchema<W extends z.ZodType> = 0 extends 1 & z.input<W>
  ? ConfigurationError<'Wire schema input must not be any. Use a schema with a specific JSON input type.'>
  : [z.input<W>] extends [JsonValue]
    ? W
    : ConfigurationError<'Wire schema input must be JSON-compatible. Encode dates, bigints, and other non-JSON values as JSON wire data.'>;
export type LiteralName<K extends string> = K &
  (K extends ''
    ? ConfigurationError<'name must be a non-empty string literal.'>
    : string extends K
      ? ConfigurationError<'name must be a string literal, not a widened string. Use a literal or as const.'>
      : unknown);

export type ReservedField =
  | 'docs'
  | 'documentation'
  | 'view'
  | 'to'
  | 'is'
  | 'mint'
  | 'schema'
  | 'codec'
  | 'seal'
  | 'allocate'
  | 'debug'
  | 'parts'
  | '__proto__'
  | 'constructor'
  | 'prototype'
  | 'then'
  | 'toJSON'
  | 'valueOf'
  | 'toString';
export type SemanticKey = string | number | bigint | boolean | null | undefined;
export type IdentityOptions<P> = {
  /** Required semantic identity. Normalize Parts in the schema before key runs. */
  key: (parts: P) => SemanticKey;
};
export type DeepReadonly<T> =
  T extends Proof<string>
    ? T
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;
type ViewCheck<T> =
  T extends Proof<string>
    ? T
    : T extends (...args: any[]) => any
      ? never
      : T extends
            | Date
            | Map<any, any>
            | Set<any>
            | WeakMap<any, any>
            | WeakSet<any>
            | ArrayBuffer
            | ArrayBufferView
            | Promise<any>
        ? never
        : T extends object
          ? { [K in keyof T]: K extends symbol ? never : ViewCheck<T[K]> }
          : T;
export type CheckedView<F> = F & {
  [N in keyof F]: F[N] extends (...args: any[]) => infer R
    ? [R] extends [ViewCheck<R>]
      ? unknown
      : ConfigurationError<'View outputs must be primitives, sealed values, arrays, or plain data objects. They become deeply readonly.'>
    : unknown;
} & {
  [
    N in Extract<keyof F, ReservedField>
  ]: ConfigurationError<`Field name "${N}" is reserved. Choose a different projection name.`>;
} & {
  [
    N in Extract<keyof F, symbol>
  ]: ConfigurationError<'Symbol-named projections are not supported. Use a string projection name.'>;
};

/** Examples are validated when .seal() is called; they do not configure the producer. */
type ObservationDocumentation<O, N extends 'view' | 'to'> =
  O extends Record<N, infer F>
    ? keyof F extends never
      ? {}
      : {
          readonly [S in N]: {
            readonly [K in keyof F]: Readonly<{
              description: string;
              example?: F[K] extends (...args: any[]) => infer R
                ? DeepReadonly<R>
                : never;
            }>;
          };
        }
    : {};
export type ProjectionDocumentation<O> = Readonly<{ description?: string }> &
  ObservationDocumentation<O, 'view'> &
  ObservationDocumentation<O, 'to'>;
export type MintedDocumentation<O> = ProjectionDocumentation<O>;
export type ValueExample<W extends z.ZodType, O> = Readonly<{
  input: z.input<W>;
  encoded: z.input<W>;
}>;
export type ValueDocumentation<W extends z.ZodType, O> = ProjectionDocumentation<O> &
  Readonly<{
    examples: readonly [ValueExample<W, O>, ...ValueExample<W, O>[]];
  }>;

type DocumentationMessage<N> = N extends 'examples'
  ? 'Minted definitions have no wire examples. Remove examples.'
  : N extends 'view'
    ? 'docs.view requires declared projections. Add projections to .view({ ... }) first.'
    : N extends string
      ? `Unknown documentation property "${N}". Check the documentation property name.`
      : 'Symbol-named documentation properties are not supported.';
type ExampleAt<A> = A extends { readonly examples: readonly (infer E)[] } ? E : {};
type CheckedExample<P, A> = P & {
  [
    N in Exclude<keyof P, keyof A>
  ]: ConfigurationError<'Unknown example property. Use input and encoded.'>;
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

// Before projections are configured, their names and sample types are checked at seal.
type PendingDocumentation<O, N extends 'view' | 'to'> =
  O extends Record<N, unknown>
    ? {}
    : {
        readonly [K in N]?: Readonly<
          Record<string, { readonly description: string; readonly example?: unknown }>
        >;
      };
type BuilderDocumentation<O, A> = A &
  PendingDocumentation<O, 'view'> &
  PendingDocumentation<O, 'to'>;
type ExtraDocumentedNames<D, A, N extends 'view' | 'to'> =
  D extends Record<N, infer V>
    ? A extends Record<N, infer AV>
      ? Exclude<keyof V, keyof AV>
      : keyof V | N
    : never;
type SealDocumentation<D, A> = [D] extends [undefined]
  ? unknown
  : D extends A
    ? [
        | Exclude<keyof D, keyof A>
        | ExtraDocumentedNames<D, A, 'view'>
        | ExtraDocumentedNames<D, A, 'to'>,
      ] extends [never]
      ? unknown
      : InvalidFinalDocumentation
    : InvalidFinalDocumentation;
type InvalidFinalDocumentation =
  ConfigurationError<'Documentation must match the final view and conversions. Document every member, remove unknown names, and use examples with its output type before calling .seal().'>;

type Documented<T, D> = D extends undefined ? T : T & { readonly documentation: D };
/** Configuration only. Call .seal() to create the completed kind. */
export interface ValueBuilder<
  K extends string,
  W extends z.ZodType,
  P,
  O = {},
  D = undefined,
> {
  readonly to: <const F extends Record<string, (parts: P) => unknown>>(
    conversions: F & CheckedConversions<NoInfer<F>>,
  ) => ValueBuilder<K, W, P, Omit<O, 'to'> & { to: F }, D>;
  readonly view: <const F extends Record<string, (parts: P) => unknown>>(
    projections: CheckedView<F>,
  ) => ValueBuilder<K, W, P, Omit<O, 'view'> & { view: F }, D>;
  readonly docs: <
    const M extends DocumentationInput<
      M,
      BuilderDocumentation<O, ValueDocumentation<W, O>>
    >,
  >(
    metadata: CheckedDocumentation<
      M,
      BuilderDocumentation<O, ValueDocumentation<W, O>>
    >,
  ) => ValueBuilder<K, W, P, O, M>;
  readonly seal: (
    this: SealDocumentation<D, ValueDocumentation<W, O>>,
  ) => Documented<ValueKind<K, W, O>, D>;
}
/** Configuration only. Call .seal() to create the completed kind. */
export interface MintedBuilder<K extends string, I, P, E, O = {}, D = undefined> {
  readonly to: <const F extends Record<string, (parts: P) => unknown>>(
    conversions: F & CheckedConversions<NoInfer<F>>,
  ) => MintedBuilder<K, I, P, E, Omit<O, 'to'> & { to: F }, D>;
  readonly view: <const F extends Record<string, (parts: P) => unknown>>(
    projections: CheckedView<F>,
  ) => MintedBuilder<K, I, P, E, Omit<O, 'view'> & { view: F }, D>;
  readonly docs: <
    const M extends DocumentationInput<
      M,
      BuilderDocumentation<O, MintedDocumentation<O>>
    >,
  >(
    metadata: CheckedDocumentation<M, BuilderDocumentation<O, MintedDocumentation<O>>>,
  ) => MintedBuilder<K, I, P, E, O, M>;
  readonly seal: (
    this: SealDocumentation<D, MintedDocumentation<O>>,
  ) => Documented<MintedKind<K, I, E, O>, D>;
}
