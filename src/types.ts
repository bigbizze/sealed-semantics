import type { z } from 'zod';
import type { ValueMap, ValueSet } from './collections.js';
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type Result<T, E = ValueError> =
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
        readonly 'ValueOf requires a completed kind. Call .with(...) on the definition first.': never;
      },
> = Kd extends { is(x: unknown): x is infer V } ? V : never;
export type ProjectionOptions<P> = {
  view?: Record<string, (p: P) => unknown>;
  debug?: (p: P) => string;
};
export type ValueOptions<W extends z.ZodType, P> = ProjectionOptions<P> & {
  toWireShape: (p: P) => z.output<W>;
  equals?: (a: P, b: P) => boolean;
  allocate?: (...args: any[]) => z.input<W>;
  canonical?: (p: P) => unknown;
};
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
    /** Attach typed documentation without changing the producer or its brand. */
    docs(metadata: ValueDocumentation<W, O>): ValueKind<K, W, O> & {
      readonly documentation: ValueDocumentation<W, O>;
    };
    readonly kind: K;
    is(x: unknown): x is SemanticValue<K, W, O>;
    parse(input: unknown): Result<SemanticValue<K, W, O>>;
    readonly wire: z.ZodCodec<
      W,
      z.ZodType<SemanticValue<K, W, O>, SemanticValue<K, W, O>>
    >;
    map<V>(): ValueMap<ValueKind<K, W, O>, V>;
    set(): ValueSet<ValueKind<K, W, O>>;
  } & (O extends { allocate: (...args: infer A) => unknown }
    ? { allocate(...args: A): Result<SemanticValue<K, W, O>> }
    : {})
>;
export type DerivedKind<K extends string, I, O> = Readonly<{
  /** Attach documentation without changing the derivation or its brand. */
  docs(metadata: DerivedDocumentation<O>): DerivedKind<K, I, O> & {
    readonly documentation: DerivedDocumentation<O>;
  };
  readonly kind: K;
  is(x: unknown): x is DerivedValue<K, O>;
  derive(input: I): Result<DerivedValue<K, O>>;
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
  | 'derive'
  | 'wire'
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
export type CheckedOptions<O, Allowed> = O & {
  [N in Exclude<keyof O, keyof Allowed>]: ConfigurationError<
    N extends 'fields'
      ? 'The fields option was renamed to view. Configure projections under view.'
      : N extends 'canonical' | 'allocate' | 'toWireShape' | 'equals'
        ? `Derived definitions cannot configure ${N}. Only semantic definitions support this option.`
        : N extends string
          ? `Unknown .with option "${N}". Check the option name; documentation belongs in .docs(...).`
          : 'Symbol-named options are not supported. Use a declared string option name.'
  >;
} & (O extends { view: infer F }
    ? {
        view: F & {
          [N in Extract<keyof F, ReservedField>]: {
            readonly [
              Message in `Field name "${N}" is reserved. Choose a different projection name.`
            ]: never;
          };
        } & {
          [N in Extract<keyof F, symbol>]: {
            readonly 'Symbol-named projections are not supported. Use a string projection name.': never;
          };
        };
      }
    : unknown);

/** Examples describe outputs; they do not configure or validate the producer. */
export type ProjectionDocumentation<O> = Readonly<{
  description?: string;
  views?: O extends { view: infer F }
    ? keyof F extends never
      ? ConfigurationError<'docs.views requires declared projections. Add projections to .with({ view: ... }) first.'>
      : {
          readonly [N in keyof F]?: Readonly<{
            description?: string;
            example?: F[N] extends (...args: any[]) => infer R ? R : never;
          }>;
        }
    : ConfigurationError<'docs.views requires declared projections. Add projections to .with({ view: ... }) first.'>;
}>;
export type DerivedDocumentation<O> = ProjectionDocumentation<O> &
  Readonly<{
    exampleWire?: ConfigurationError<'Derived definitions have no wire representation. Remove exampleWire.'>;
    exampleCanonical?: ConfigurationError<'Derived definitions have no canonical representation. Remove exampleCanonical.'>;
  }>;
export type ValueDocumentation<W extends z.ZodType, O> = ProjectionDocumentation<O> &
  Readonly<{
    exampleWire?: z.input<W>;
    exampleCanonical?: O extends { canonical: (...args: any[]) => infer C }
      ? C
      : ConfigurationError<'exampleCanonical requires canonical in .with(...). Add canonical or remove exampleCanonical.'>;
  }>;

/** An unfinished semantic definition. Call .with(...) to create its kind. */
export interface ValueBuilder<K extends string, W extends z.ZodType, P> {
  readonly with: <const O extends ValueOptions<W, P>>(
    options: CheckedOptions<O, ValueOptions<W, P>>,
  ) => ValueKind<K, W, O>;
}
/** An unfinished derived definition. Call .with(...) to create its kind. */
export interface DerivedBuilder<K extends string, I, P> {
  readonly with: <const O extends ProjectionOptions<P> & Record<keyof O, unknown>>(
    options: CheckedOptions<O, ProjectionOptions<P>>,
  ) => DerivedKind<K, I, O>;
}
