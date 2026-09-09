import type { z } from 'zod';
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type Result<T, E = ValueError> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };
export interface ValueError { readonly kind: string; readonly reason: 'invalid_wire' | 'invalid_parts' | 'invalid_input'; readonly issues: readonly string[]; }
declare const BRAND: unique symbol;
export interface Proof<K extends string> {
  readonly [BRAND]: K;
  equals(other: Proof<K>): boolean;
  debug(): string;
  toJSON(): never;
  valueOf(): never;
  [Symbol.toPrimitive](): never;
}
export interface Value<K extends string, R> extends Proof<K> { encode(): R; }
export interface AnyKind { readonly kind: string; is(x: unknown): x is Proof<string>; }
export type ValueOf<Kd extends AnyKind> = Kd extends { is(x: unknown): x is infer V } ? V : never;
export type ProjectionOptions<P> = { fields?: Record<string, (p: P) => unknown>; debug?: (p: P) => string };
export type ValueOptions<W extends z.ZodType, P> = ProjectionOptions<P> & {
  toWireShape: (p: P) => z.output<W>;
  equals?: (a: P, b: P) => boolean;
  allocate?: (...args: any[]) => z.input<W>;
  canonical?: (p: P) => unknown;
};
type Fields<O, V> = O extends { fields: infer F } ? { readonly [N in keyof F]: F[N] extends (...a: any[]) => infer R ? (v: V) => R : never } : {};
export type ValueKind<K extends string, W extends z.ZodType, O> = {
  readonly kind: K;
  is(x: unknown): x is Value<K, z.input<W>>;
  parse(input: unknown): Result<Value<K, z.input<W>>>;
  readonly wire: z.ZodCodec<W, z.ZodType<Value<K, z.input<W>>, Value<K, z.input<W>>>>;
} & Fields<O, Value<K, z.input<W>>> & (O extends { allocate: (...args: infer A) => unknown } ? { allocate(...args: A): Result<Value<K, z.input<W>>> } : {}) &
  (O extends { canonical: (...args: any[]) => infer C } ? { canonical(v: Value<K, z.input<W>>): C } : {});
export type DerivedKind<K extends string, I, O> = { readonly kind: K; is(x: unknown): x is Proof<K>; derive(input: I): Result<Proof<K>> } & Fields<O, Proof<K>>;
export type JsonSchema<W extends z.ZodType> = 0 extends (1 & z.input<W>) ? never : [z.input<W>] extends [JsonValue] ? W : never;
export type LiteralKind<K extends string> = string extends K ? never : K;

export type ReservedField = 'kind' | 'is' | 'parse' | 'derive' | 'wire' | 'allocate' | 'canonical' | 'encode' | 'equals' | 'debug' | 'parts' | 'raw' | 'unwrap' | 'fromParts' | 'indexKey' | '__proto__' | 'constructor' | 'prototype' | 'then' | 'toJSON' | 'valueOf' | 'toString';
export type CheckedOptions<O, Allowed> = O & Record<Exclude<keyof O, keyof Allowed>, never> &
  (O extends { fields: infer F } ? { fields: F & Record<Extract<keyof F, ReservedField>, never> } : unknown);
