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
export type SemanticValue<K extends string, W extends z.ZodType, O> = Proof<K> &
  Views<O>;
export type MintedValue<K extends string, O> = Proof<K> & Views<O>;
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
export type ProjectionDocumentation<O> = Readonly<{ description?: string }> &
  (O extends { view: infer F }
    ? keyof F extends never
      ? {}
      : {
          readonly view: {
            readonly [N in keyof F]: Readonly<{
              description: string;
              example?: F[N] extends (...args: any[]) => infer R
                ? DeepReadonly<R>
                : never;
            }>;
          };
        }
    : {});
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
type BuilderDocumentation<O, A> = O extends { view: unknown }
  ? A
  : A & {
      readonly view?: Readonly<
        Record<string, { readonly description: string; readonly example?: unknown }>
      >;
    };
type SealDocumentation<D, A> = [D] extends [undefined]
  ? unknown
  : D extends A
    ? Exclude<keyof D, keyof A> extends never
      ? D extends { view: infer V }
        ? A extends { readonly view: infer AV }
          ? Exclude<keyof V, keyof AV> extends never
            ? unknown
            : InvalidFinalDocumentation
          : InvalidFinalDocumentation
        : unknown
      : InvalidFinalDocumentation
    : InvalidFinalDocumentation;
type InvalidFinalDocumentation =
  ConfigurationError<'Documentation must match the final view. Document every projection, remove unknown names, and use examples with the projection output type before calling .seal().'>;

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
