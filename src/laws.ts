// Test-only entry point. Consumers install fast-check as a development dependency.
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import { stableWireKey } from './keying.js';
import type { AnyKind, Result, ValueOf, ConfigurationError } from './types.js';
type CollectionKind = AnyKind & {
  map<V>(): { set(k: any, v: V): any; get(k: any): V | undefined; size: number };
  set(): { add(k: any): any; size: number };
};
type SemanticKind = CollectionKind & {
  parse(input: unknown): Result<any>;
  wire: unknown;
};
type Derived = CollectionKind & { derive(input: any): Result<any> };
type Return<K, N extends PropertyKey> =
  K extends Record<N, (...args: any[]) => infer R> ? R : never;
type Mutator<T> = (value: T) => void;
type ProjectionMutator<V, N extends 'encode' | 'canonical'> =
  V extends Record<N, (...args: any[]) => infer R>
    ? Mutator<R>
    : ConfigurationError<`projectionMutators.${N} requires a declared ${N} operation. Remove this mutator.`>;
type Mutators<K extends AnyKind> = {
  encode?: ProjectionMutator<ValueOf<K>, 'encode'>;
  canonical?: ProjectionMutator<ValueOf<K>, 'canonical'>;
  view?: ValueOf<K> extends { readonly view: infer V }
    ? { [N in keyof V]?: Mutator<V[N]> }
    : ConfigurationError<'projectionMutators.view requires declared view projections. Add projections or remove this mutator.'>;
};
function acquire<T>(result: Result<T>): T {
  assert.equal(result.ok, true, 'generator must produce accepted inputs');
  if (!result.ok) throw new Error('Rejected generated input');
  return result.value;
}
function snapshot(
  x: any,
  isSealed: (value: unknown) => boolean,
  seen = new Map<object, any>(),
): any {
  if (x === null || (typeof x !== 'object' && typeof x !== 'function') || isSealed(x))
    return x;
  if (seen.has(x)) return seen.get(x);
  if (ArrayBuffer.isView(x))
    return {
      type: x.constructor,
      bytes: [...new Uint8Array(x.buffer, x.byteOffset, x.byteLength)],
    };
  if (x instanceof Date) return { date: x.getTime() };
  const out: any = { prototype: Object.getPrototypeOf(x), properties: [] };
  seen.set(x, out);
  if (x instanceof Map)
    out.entries = [...x].map(([k, v]) => [
      snapshot(k, isSealed, seen),
      snapshot(v, isSealed, seen),
    ]);
  if (x instanceof Set) out.entries = [...x].map((v) => snapshot(v, isSealed, seen));
  for (const key of Reflect.ownKeys(x)) {
    const descriptor = Object.getOwnPropertyDescriptor(x, key)!;
    if ('value' in descriptor)
      out.properties.push([key, snapshot(descriptor.value, isSealed, seen)]);
    else out.properties.push([key, { get: descriptor.get, set: descriptor.set }]);
  }
  return out;
}
function mutate(
  x: any,
  isSealed: (value: unknown) => boolean,
  seen = new Set<object>(),
): void {
  if (typeof x === 'function')
    throw new TypeError(
      'Function-valued projections require an explicit projectionMutator',
    );
  if (x === null || typeof x !== 'object' || isSealed(x) || seen.has(x)) return;
  seen.add(x);
  if (ArrayBuffer.isView(x)) {
    const bytes = new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    for (let i = 0; i < bytes.length; i++) bytes[i] = bytes[i]! ^ 255;
    return;
  }
  const array = Array.isArray(x);
  if (
    array ||
    Object.getPrototypeOf(x) === Object.prototype ||
    Object.getPrototypeOf(x) === null
  ) {
    // A frozen outer container can still hold mutable aliases. Visit children
    // before attempting writes; rejected writes are expected, not law failures.
    for (const key of Reflect.ownKeys(x)) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(x, key)!;
      if (!('value' in descriptor)) continue;
      mutate(descriptor.value, isSealed, seen);
      Reflect.set(x, key, '__law_probe__');
    }
    if (array) {
      if (Object.isExtensible(x)) Reflect.set(x, String(x.length), '__law_probe__');
    } else {
      Reflect.set(x, '__law_probe__', true);
    }
    return;
  }
  throw new TypeError(
    'Supply a projectionMutator for this mutable projection type, or list its sealed kind in sealedKinds',
  );
}
function projections(value: any): Record<string, () => any> {
  const result: Record<string, () => any> = {};
  if ('encode' in value) result.encode = () => value.encode();
  if ('canonical' in value) result.canonical = () => value.canonical();
  for (const name of Object.keys(value.view ?? {}))
    result[`view.${name}`] = () => value.view[name];
  return result;
}
function shared<K extends AnyKind>(
  kind: K,
  value: any,
  mutators: Mutators<K> = {},
  sealedKinds: readonly AnyKind[] = [],
): void {
  const isSealed = (x: unknown) => kind.is(x) || sealedKinds.some((k) => k.is(x));
  assert(Object.isFrozen(kind));
  assert(kind.is(value));
  assert(Object.isFrozen(value));
  assert(Object.isFrozen(Object.getPrototypeOf(value)));
  const prototype = Object.getPrototypeOf(value);
  assert(!kind.is(Object.create(prototype)), 'prototype forgery');
  assert.throws(() => new prototype.constructor(), TypeError);
  const message =
    'encode' in value
      ? `${kind.kind} cannot be serialized implicitly; use value.encode() or encode the enclosing contract schema`
      : `${kind.kind} has no external representation and cannot be serialized`;
  for (const attempt of [
    () => JSON.stringify(value),
    () => `${value}`,
    () => String(value),
    () => +value,
    () => value.valueOf(),
  ])
    assert.throws(attempt, { name: 'TypeError', message });
  assert.deepEqual({ ...value }, {});
  assert.deepEqual(Object.keys(value), []);
  assert(!kind.is(structuredClone(value)));
  const runtimeMutators = mutators as {
    encode?: Mutator<any>;
    canonical?: Mutator<any>;
    view?: Record<string, Mutator<any>>;
  };
  const all = projections(value);
  const observe = () =>
    Object.fromEntries(
      Object.entries(all).map(([name, project]) => [
        name,
        snapshot(project(), isSealed),
      ]),
    );
  for (const [name, project] of Object.entries(all)) {
    const before = observe();
    const custom = name.startsWith('view.')
      ? runtimeMutators.view?.[name.slice(5)]
      : (runtimeMutators as any)[name];
    if (custom) custom(project());
    else mutate(project(), isSealed);
    assert.deepEqual(observe(), before, `projection leaked mutable Parts: ${name}`);
  }
}
export function assertValueLaws<K extends SemanticKind>(
  kind: K,
  options: {
    validWire: fc.Arbitrary<Return<ValueOf<K>, 'encode'>>;
    equivalentAliases?: fc.Arbitrary<
      [Return<ValueOf<K>, 'encode'>, Return<ValueOf<K>, 'encode'>]
    >;
    allocateArgs?: K extends { allocate(...args: infer A): unknown }
      ? fc.Arbitrary<A>
      : ConfigurationError<'allocateArgs requires an allocator in .with(...). Add allocate or remove allocateArgs.'>;
    projectionMutators?: Mutators<K>;
    sealedKinds?: readonly AnyKind[];
  },
): void {
  fc.assert(
    fc.property(
      options.validWire,
      options.validWire,
      options.validWire,
      (wa, wb, wc) => {
        const [a, b, c] = [wa, wb, wc].map((w) => acquire(kind.parse(w)));
        shared(kind, a, options.projectionMutators, options.sealedKinds);
        const raw = a.encode(),
          key = stableWireKey(raw);
        assert.deepEqual(
          JSON.parse(key),
          raw,
          'JSON domain and negative-zero round trip',
        );
        assert(acquire(kind.parse(raw)).equals(a), 'encode/parse round trip');
        assert.equal(
          a.equals(b),
          key === stableWireKey(b.encode()),
          'custom equality must agree with keys',
        );
        assert(a.equals(a));
        assert.equal(a.equals(b), b.equals(a));
        if (a.equals(b) && b.equals(c)) assert(a.equals(c));
        if (a.equals(b) && 'canonical' in a)
          assert.deepEqual(a.canonical(), b.canonical());
        const copy = acquire(kind.parse(raw));
        assert(a.equals(copy));
        if ('canonical' in a) assert.deepEqual(a.canonical(), copy.canonical());
        const map = kind.map<number>().set(a, 1);
        assert.equal(map.get(copy), 1);
        assert.equal(kind.set().add(a).add(copy).size, 1);
      },
    ),
  );
  if (options.equivalentAliases)
    fc.assert(
      fc.property(options.equivalentAliases, ([wa, wb]) => {
        const a = acquire(kind.parse(wa)),
          b = acquire(kind.parse(wb));
        assert(a.equals(b));
        assert.deepEqual(a.encode(), b.encode());
        if ('canonical' in a) assert.deepEqual(a.canonical(), b.canonical());
      }),
    );
  if (options.allocateArgs)
    fc.assert(
      fc.property(options.allocateArgs as fc.Arbitrary<any[]>, (args) => {
        assert('allocate' in kind, 'allocateArgs requires an allocator');
        const value = acquire((kind as any).allocate(...args));
        shared(kind, value, options.projectionMutators, options.sealedKinds);
        assert(acquire(kind.parse((value as any).encode())).equals(value));
      }),
    );
}
export function assertDerivedLaws<K extends Derived>(
  kind: K,
  options: {
    validInput: fc.Arbitrary<Parameters<K['derive']>[0]>;
    projectionMutators?: Mutators<K>;
    sealedKinds?: readonly AnyKind[];
  },
): void {
  fc.assert(
    fc.property(options.validInput, (input) => {
      const a = acquire(kind.derive(input)),
        b = acquire(kind.derive(input));
      shared(kind, a, options.projectionMutators, options.sealedKinds);
      assert(a.equals(a));
      assert(!a.equals(b));
      assert(!b.equals(a));
      const map = kind.map<number>().set(a, 1).set(b, 2);
      assert.equal(map.size, 2);
      assert.equal(map.get(a), 1);
      assert.equal(map.get(b), 2);
      assert.equal(kind.set().add(a).add(a).add(b).size, 2);
      assert(!('encode' in a));
      assert(!('canonical' in a));
    }),
  );
}

/** Check a documented wire example and its normalized round trip, without sampling. */
export function assertValueDocs<
  K extends SemanticKind & {
    readonly documentation: { readonly exampleWire?: unknown };
  },
>(kind: K): void {
  if (!Object.hasOwn(kind.documentation, 'exampleWire')) return;
  const parsed = kind.parse(kind.documentation.exampleWire);
  assert(parsed.ok, `${kind.kind}: documentation.exampleWire was rejected by parse`);
  if (!parsed.ok) return;
  assert(
    kind.is(parsed.value),
    `${kind.kind}: documentation example has an invalid brand`,
  );
  const value: any = parsed.value;
  const raw = value.encode();
  const key = stableWireKey(raw);
  const reparsed = kind.parse(raw);
  assert(reparsed.ok, `${kind.kind}: encoded documentation example was rejected`);
  if (!reparsed.ok) return;
  assert(
    value.equals(reparsed.value),
    `${kind.kind}: documentation round trip changed equality`,
  );
  assert.equal(
    stableWireKey(reparsed.value.encode()),
    key,
    `${kind.kind}: documentation round trip changed encoding`,
  );
}
