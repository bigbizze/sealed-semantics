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
export type ValueOf<Kd extends AnyKind> = Kd extends { is(x: unknown): x is infer V }
  ? V
  : never;
export type ProjectionOptions<P> = {
  fields?: Record<string, (p: P) => unknown>;
  debug?: (p: P) => string;
};
export type ValueOptions<W extends z.ZodType, P> = ProjectionOptions<P> & {
  toWireShape: (p: P) => z.output<W>;
  equals?: (a: P, b: P) => boolean;
  allocate?: (...args: any[]) => z.input<W>;
  canonical?: (p: P) => unknown;
};
type Views<O> = O extends { fields: infer F }
  ? keyof F extends never
    ? {}
    : {
        readonly view: {
          readonly [N in keyof F]: F[N] extends (...a: any[]) => infer R
            ? () => R
            : never;
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
  docs(metadata: ProjectionDocumentation<O>): DerivedKind<K, I, O> & {
    readonly documentation: ProjectionDocumentation<O>;
  };
  readonly kind: K;
  is(x: unknown): x is DerivedValue<K, O>;
  derive(input: I): Result<DerivedValue<K, O>>;
  map<V>(): ValueMap<DerivedKind<K, I, O>, V>;
  set(): ValueSet<DerivedKind<K, I, O>>;
}>;
export type JsonSchema<W extends z.ZodType> = 0 extends 1 & z.input<W>
  ? never
  : [z.input<W>] extends [JsonValue]
    ? W
    : never;
export type LiteralKind<K extends string> = string extends K ? never : K;

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
export type CheckedOptions<O, Allowed> = O &
  Record<Exclude<keyof O, keyof Allowed>, never> &
  (O extends { fields: infer F }
    ? {
        fields: F & {
          [N in Extract<keyof F, ReservedField>]: {
            readonly [
              Message in `Field name "${N}" is reserved. Choose a different projection name.`
            ]: never;
          };
        } & {
          [N in Extract<keyof F, symbol>]: {
            readonly 'Symbol-named fields are not supported. Use a string projection name.': never;
          };
        };
      }
    : unknown);

/** Examples describe outputs; they do not configure or validate the producer. */
export type ProjectionDocumentation<O> = Readonly<{
  description?: string;
  views?: O extends { fields: infer F }
    ? {
        readonly [N in keyof F]?: Readonly<{
          description?: string;
          example?: F[N] extends (...args: any[]) => infer R ? R : never;
        }>;
      }
    : never;
}>;
export type ValueDocumentation<W extends z.ZodType, O> = ProjectionDocumentation<O> &
  Readonly<{
    exampleWire?: z.input<W>;
    exampleCanonical?: O extends { canonical: (...args: any[]) => infer C } ? C : never;
  }>;
