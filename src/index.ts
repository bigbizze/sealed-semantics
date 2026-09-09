import { z } from 'zod';
import { makeSeal } from './seal.js';
import { makeCodec } from './codec.js';
import { stableWireKey } from './keying.js';
import type { Result, ValueOptions, ProjectionOptions, ValueKind, DerivedKind, JsonSchema, LiteralKind, CheckedOptions } from './types.js';
export type { Result, ValueError, ValueOf, JsonValue, AnyKind } from './types.js';
export { IdMap, IdSet } from './collections.js';
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
const seen = new Set<string>();
const reserved = new Set(['kind', 'is', 'parse', 'derive', 'wire', 'allocate', 'canonical', 'encode', 'equals', 'debug', 'parts', 'raw', 'unwrap', 'fromParts', 'indexKey', '__proto__', 'constructor', 'prototype', 'then', 'toJSON', 'valueOf', 'toString']);
function register(kind: string, fields: object = {}) {
  if (typeof kind !== 'string' || !/^[^\s/]+\/\S+$/.test(kind)) throw new TypeError('kind must be a namespaced string literal');
  if (seen.has(kind)) throw new TypeError(`Duplicate kind: ${kind}`);
  for (const name of Object.keys(fields)) if (reserved.has(name)) throw new TypeError(`Reserved field: ${name}`);
  seen.add(kind);
}
function projections<P>(target: object, options: ProjectionOptions<P>, read: (v: unknown) => P) {
  for (const [name, project] of Object.entries(options.fields ?? {})) Object.defineProperty(target, name, { enumerable: true, value: (v: unknown) => project(read(v)) });
}
export function defineValue<const K extends string, W extends z.ZodType, P>(spec: {
  kind: LiteralKind<K>; wire: W & JsonSchema<W>; decode: (w: z.output<W>) => Result<P>;
}): { with<const O extends ValueOptions<W, P>>(options: CheckedOptions<O, ValueOptions<W, P>>): ValueKind<K, W, O> } {
  const { kind, wire, decode } = spec;
  return { with<const O extends ValueOptions<W, P>>(options: CheckedOptions<O, ValueOptions<W, P>>): ValueKind<K, W, O> {
    register(kind, options.fields);
    const { toWireShape, equals, debug, allocate, canonical } = options;
    const encode = (p: P) => z.encode(wire, toWireShape(p));
    const bridge = makeSeal(kind, { encode, debug, equals: equals ?? ((a, b) => stableWireKey(encode(a)) === stableWireKey(encode(b))) });
    const parse = (input: unknown) => {
      const parsed = wire.safeParse(input);
      if (!parsed.success) return err({ kind, reason: 'invalid_wire' as const, issues: parsed.error.issues.map(i => i.message) });
      const result = decode(parsed.data);
      return result.ok ? ok(bridge.seal(result.value)) : result;
    };
    const result = { kind, is: bridge.is, parse, wire: makeCodec(wire, kind, decode, bridge.seal, bridge.is, bridge.read, toWireShape) };
    if (allocate) Object.assign(result, { allocate: (...args: Parameters<typeof allocate>) => parse(allocate(...args)) });
    if (canonical) Object.assign(result, { canonical: (v: unknown) => canonical(bridge.read(v)) });
    projections(result, options, bridge.read);
    return result as unknown as ValueKind<K, W, O>;
  } };
}
export function defineDerived<const K extends string, I, P>(spec: {
  kind: LiteralKind<K>; derive: (input: I) => Result<P>;
}): { with<const O extends ProjectionOptions<P>>(options: CheckedOptions<O, ProjectionOptions<P>>): DerivedKind<K, I, O> } {
  const { kind, derive } = spec;
  return { with<const O extends ProjectionOptions<P>>(options: CheckedOptions<O, ProjectionOptions<P>>): DerivedKind<K, I, O> {
    for (const key of ['wire', 'allocate', 'canonical', 'equals']) if (key in spec || key in options) throw new TypeError(`Derived definitions cannot declare ${key}`);
    register(kind, options.fields);
    const bridge = makeSeal<P>(kind, { debug: options.debug });
    const result = { kind, is: bridge.is, derive: (input: I) => {
      const produced = derive(input);
      return produced.ok ? ok(bridge.seal(produced.value)) : produced;
    } };
    projections(result, options, bridge.read);
    return result as unknown as DerivedKind<K, I, O>;
  } };
}
