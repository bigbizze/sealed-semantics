import type { z } from 'zod';
import { encodeWire, parseCodec } from './zod-codec.js';
// Test-only entry point. Consumers install fast-check as a development dependency.
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import { stableWireKey } from './keying.js';
import type { AnyKind, ProducerResult, ValueOf, ConfigurationError } from './types.js';
type CollectionKind = AnyKind & {
  map<V>(): { set(k: any, v: V): any; get(k: any): V | undefined; size: number };
  set(): { add(k: any): any; size: number };
};
type SemanticKind = CollectionKind & {
  codec: z.ZodType<import('./types.js').Proof<string>, any>;
};
type Minted = CollectionKind & { mint(input: any): ProducerResult<any> };
type Mutator<T> = (value: T) => void;
type Mutators<K extends AnyKind> =
  ValueOf<K> extends { readonly view: infer V }
    ? { view?: { [N in keyof V]?: Mutator<V[N]> } }
    : {};
type CommonLawOptions<K extends AnyKind> = {
  sealedKinds?: readonly AnyKind[];
} & (keyof Mutators<K> extends never ? {} : { projectionMutators?: Mutators<K> });
type ValueLawOptions<K extends SemanticKind> = CommonLawOptions<K> & {
  validWire: fc.Arbitrary<z.input<K['codec']>>;
  equivalentAliases?: fc.Arbitrary<[z.input<K['codec']>, z.input<K['codec']>]>;
} & (K extends { allocate(...args: infer A): unknown }
    ? { allocateArgs?: fc.Arbitrary<A> }
    : {});
type MintedLawOptions<K extends Minted> = CommonLawOptions<K> & {
  validInput: fc.Arbitrary<Parameters<K['mint']>[0]>;
};
type OptionAt<O, N extends PropertyKey> = N extends keyof O ? NonNullable<O[N]> : {};
type CheckedMutators<P, A> = P & {
  [N in Exclude<keyof P, keyof A>]: ConfigurationError<
    N extends 'encode' | 'canonical'
      ? 'Only declared view projections accept mutators. Encoding is checked through the codec; canonical was removed.'
      : N extends 'view'
        ? 'projectionMutators.view requires declared view projections. Add projections or remove this mutator.'
        : 'Unknown projection mutator. Use a declared operation or view projection.'
  >;
} & (P extends { view: infer V }
    ? 'view' extends keyof A
      ? {
          view: V & {
            [N in Exclude<keyof V, keyof OptionAt<A, 'view'>>]: ConfigurationError<
              N extends string
                ? `Unknown view mutator "${N}". Use a declared view projection.`
                : 'Symbol-named view mutators are not supported.'
            >;
          };
        }
      : unknown
    : unknown);
type InferLawOptions<P, A> = A &
  Record<keyof P, unknown> &
  ('projectionMutators' extends keyof A
    ? {
        projectionMutators?: OptionAt<A, 'projectionMutators'> &
          Record<keyof OptionAt<P, 'projectionMutators'>, unknown> &
          ('view' extends keyof OptionAt<A, 'projectionMutators'>
            ? {
                view?: OptionAt<OptionAt<A, 'projectionMutators'>, 'view'> &
                  Record<
                    keyof OptionAt<OptionAt<P, 'projectionMutators'>, 'view'>,
                    unknown
                  >;
              }
            : unknown);
      }
    : unknown);
type CheckedLawOptions<P, A> = P & {
  [N in Exclude<keyof P, keyof A | 'projectionMutators'>]: ConfigurationError<
    N extends 'allocateArgs'
      ? 'allocateArgs requires an allocator in defineKind(...). Add allocate or remove allocateArgs.'
      : 'Unknown law option. Use an option supported by this kind.'
  >;
} & (P extends { projectionMutators: infer M }
    ? {
        projectionMutators: CheckedMutators<M, OptionAt<A, 'projectionMutators'>>;
      }
    : unknown);
// Runtime access is broader than any one kind's capability-specific public type.
type RuntimeMutators = {
  view?: Record<string, Mutator<any>>;
};
function acquire<T>(result: ProducerResult<T>): T {
  assert.equal(result.ok, true, 'generator must produce accepted inputs');
  if (!result.ok) throw new Error('Rejected generated input');
  return result.value;
}
function snapshot(
  x: any,
  isSealed: (value: unknown) => boolean,
  allowAccessors = false,
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
      snapshot(k, isSealed, allowAccessors, seen),
      snapshot(v, isSealed, allowAccessors, seen),
    ]);
  if (x instanceof Set)
    out.entries = [...x].map((v) => snapshot(v, isSealed, allowAccessors, seen));
  for (const key of Reflect.ownKeys(x)) {
    const descriptor = Object.getOwnPropertyDescriptor(x, key)!;
    if ('value' in descriptor)
      out.properties.push([
        key,
        snapshot(descriptor.value, isSealed, allowAccessors, seen),
      ]);
    else {
      if (!allowAccessors)
        throw new TypeError(
          'Accessor-containing projections require an explicit projectionMutator',
        );
      out.properties.push([
        key,
        {
          getter: descriptor.get !== undefined,
          setter: descriptor.set !== undefined,
          value: snapshot(Reflect.get(x, key), isSealed, allowAccessors, seen),
        },
      ]);
    }
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
  if (
    Reflect.ownKeys(x).some(
      (key) => !('value' in Object.getOwnPropertyDescriptor(x, key)!),
    )
  )
    throw new TypeError(
      'Accessor-containing projections require an explicit projectionMutator',
    );
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
function projections(kind: AnyKind, value: any): Record<string, () => any> {
  const result: Record<string, () => any> = {};
  if ('codec' in kind)
    result.encoded = () => encodeWire((kind as SemanticKind).codec, value);
  for (const name of Object.keys(value.view ?? {}))
    result[`view.${name}`] = () => value.view[name];
  return result;
}
function shared<K extends AnyKind>(
  kind: K,
  value: any,
  mutators: RuntimeMutators = {},
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
    'codec' in kind
      ? `${kind.kind} cannot be serialized implicitly; use z.encode(Kind.codec, value) or z.encode with the enclosing contract schema`
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
  const runtimeMutators = mutators;
  const all = projections(kind, value);
  const customFor = (name: string): Mutator<any> | undefined =>
    name.startsWith('view.')
      ? runtimeMutators.view?.[name.slice(5)]
      : (runtimeMutators as any)[name];
  const observe = () =>
    Object.fromEntries(
      Object.entries(all).map(([name, project]) => [
        name,
        snapshot(project(), isSealed, customFor(name) !== undefined),
      ]),
    );
  for (const [name, project] of Object.entries(all)) {
    const before = observe();
    const custom = customFor(name);
    if (custom) custom(project());
    else mutate(project(), isSealed);
    assert.deepEqual(observe(), before, `projection leaked mutable Parts: ${name}`);
  }
}
export function assertValueLaws<
  K extends SemanticKind,
  const O extends InferLawOptions<O, ValueLawOptions<NoInfer<K>>>,
>(kind: K, checked: CheckedLawOptions<O, ValueLawOptions<K>>): void {
  const options = checked as ValueLawOptions<K> & {
    allocateArgs?: fc.Arbitrary<any[]>;
    projectionMutators?: RuntimeMutators;
  };
  fc.assert(
    fc.property(
      options.validWire,
      options.validWire,
      options.validWire,
      (wa, wb, wc) => {
        const a = parseCodec(kind.codec, wa),
          b = parseCodec(kind.codec, wb),
          c = parseCodec(kind.codec, wc);
        shared(kind, a, options.projectionMutators, options.sealedKinds);
        const raw = encodeWire(kind.codec, a),
          key = stableWireKey(raw);
        assert.deepEqual(
          JSON.parse(key),
          raw,
          'JSON domain and negative-zero round trip',
        );
        assert(parseCodec(kind.codec, raw).equals(a), 'encode/parse round trip');
        assert.equal(
          a.equals(b),
          key === stableWireKey(encodeWire(kind.codec, b)),
          'custom equality must agree with keys',
        );
        assert(a.equals(a));
        assert.equal(a.equals(b), b.equals(a));
        if (a.equals(b) && b.equals(c)) assert(a.equals(c));
        const copy = parseCodec(kind.codec, raw);
        assert(a.equals(copy));
        const map = kind.map<number>().set(a, 1);
        assert.equal(map.get(copy), 1);
        assert.equal(kind.set().add(a).add(copy).size, 1);
      },
    ),
  );
  if (options.equivalentAliases)
    fc.assert(
      fc.property(options.equivalentAliases, ([wa, wb]) => {
        const a = parseCodec(kind.codec, wa),
          b = parseCodec(kind.codec, wb);
        assert(a.equals(b));
        assert.deepEqual(encodeWire(kind.codec, a), encodeWire(kind.codec, b));
      }),
    );
  if (options.allocateArgs)
    fc.assert(
      fc.property(options.allocateArgs as fc.Arbitrary<any[]>, (args) => {
        assert('allocate' in kind, 'allocateArgs requires an allocator');
        const value = (kind as any).allocate(...args);
        shared(kind, value, options.projectionMutators, options.sealedKinds);
        assert(parseCodec(kind.codec, encodeWire(kind.codec, value)).equals(value));
      }),
    );
}
export function assertMintedLaws<
  K extends Minted,
  const O extends InferLawOptions<O, MintedLawOptions<NoInfer<K>>>,
>(kind: K, checked: CheckedLawOptions<O, MintedLawOptions<K>>): void {
  const options = checked as MintedLawOptions<K> & {
    projectionMutators?: RuntimeMutators;
  };
  fc.assert(
    fc.property(options.validInput, (input) => {
      const a = acquire(kind.mint(input)),
        b = acquire(kind.mint(input));
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
