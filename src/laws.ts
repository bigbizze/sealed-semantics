// Node-only test entry. The core package does not import Node or fast-check.
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import type { z } from 'zod';
import { encodeWire, parseCodec } from './zod-codec.js';
import { foreignValue, isSealed } from './sealed-leaf.js';
import { kindObservation, type KindObservation } from './documentation.js';
import type { AnyKind, ProducerResult, Proof, ConfigurationError } from './types.js';

type Semantic = AnyKind & {
  codec: z.ZodType<Proof<string>, any>;
  assert(value: unknown): Proof<string>;
  read(value: unknown): object;
  debug(value: unknown): string;
};
type Minted = AnyKind & {
  mint(input: any): ProducerResult<any, unknown>;
  assert(value: unknown): Proof<string>;
  read(value: unknown): object;
  debug(value: unknown): string;
};
type ValueLawOptions<K extends Semantic> = {
  validWire: fc.Arbitrary<z.input<K['codec']>>;
  equivalentAliases?: fc.Arbitrary<[z.input<K['codec']>, z.input<K['codec']>]>;
} & (K extends { allocate: (...args: infer A) => unknown }
  ? { allocateArgs?: fc.Arbitrary<A> }
  : {});
type MintedLawOptions<K extends Minted> = {
  validInput: fc.Arbitrary<Parameters<K['mint']>[0]>;
};
type Checked<P, A> = P & {
  [N in Exclude<keyof P, keyof A>]: ConfigurationError<
    N extends 'allocateArgs'
      ? 'allocateArgs requires an allocator in defineSeal(...).'
      : 'Unknown law option. Use an option supported by this kind.'
  >;
};

function observationOf(kind: AnyKind): KindObservation {
  const meta = kindObservation(kind);
  if (meta) return meta;
  throw new TypeError(
    `${kind.name}: law harness requires observation metadata from this installed package copy. The kind may come from another sealed-semantics installation, or is not a completed kind.`,
  );
}

function copies(kind: AnyKind, value: any, equivalent: any): void {
  for (const name of observationOf(kind).copy) {
    const observe = (kind as any)[name] as (x: unknown) => Uint8Array;
    const first = observe(value);
    const second = observe(value);
    assert.deepEqual(first, second, `${name} must produce equivalent data`);
    assert(first instanceof Uint8Array);
    assert(second instanceof Uint8Array);
    assert.notEqual(first, second);
    assert.notEqual(first.buffer, second.buffer);
    const original = new Uint8Array(second);
    for (let i = 0; i < first.length; i++) first[i] = first[i]! ^ 255;
    assert.deepEqual(second, original, `${name} must isolate existing copies`);
    assert.deepEqual(
      observe(value),
      original,
      `${name} mutations must not affect later copies`,
    );
    const throughEquivalent = observe(equivalent);
    assert.notEqual(throughEquivalent, first);
    assert.notEqual(throughEquivalent, second);
    assert.notEqual(throughEquivalent.buffer, first.buffer);
    assert.notEqual(throughEquivalent.buffer, second.buffer);
    assert.deepEqual(
      throughEquivalent,
      original,
      `${name} mutations must not affect copies through an equivalent decode`,
    );
  }
}

function assertFrozenGraph(value: unknown, label: string): void {
  const active = new Set<object>();
  const done = new Set<object>();
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== 'object' || isSealed(node)) return;
    if (active.has(node)) assert.fail(`${label} must be acyclic`);
    if (done.has(node)) return;
    active.add(node);
    assert(Object.isFrozen(node), `${label} must be deeply frozen`);
    assert(!Reflect.set(node, '__law_probe__', true));
    const descriptors = Object.getOwnPropertyDescriptors(node);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (Array.isArray(node) && key === 'length') continue;
      const descriptor = descriptors[key as keyof typeof descriptors];
      if (descriptor && 'value' in descriptor) visit(descriptor.value);
    }
    active.delete(node);
    done.add(node);
  };
  visit(value);
}

function observations(kind: Semantic | Minted, value: any): void {
  assert.equal(kind.assert(value), value);
  const snapshot = kind.read(value);
  assert.equal(kind.read(value), snapshot);
  assert(Object.isFrozen(snapshot));
  assert.equal(Object.getPrototypeOf(snapshot), null);
  assertFrozenGraph(snapshot, `${kind.name}.read`);
  for (const name of observationOf(kind).view) {
    const project = (kind as any)[name] as (x: unknown) => unknown;
    assert.equal(project(value), (snapshot as any)[name], `${name} must match read`);
    assert.equal(project(value), project(value), `${name} must be stable`);
    assert.throws(() => project({ view: snapshot }), TypeError);
  }
}

function shared(kind: Semantic | Minted, value: any, equivalent: any = value): void {
  assert(Boolean(kind.is(value)), foreignValue(kind.name, value, 'laws'));
  for (const x of [kind, value, Object.getPrototypeOf(value)])
    assert(Object.isFrozen(x));
  assert(!kind.is(Object.create(Object.getPrototypeOf(value))));
  assert.throws(() => new value.constructor(), TypeError);
  assert.throws(() => JSON.stringify(value), TypeError);
  assert.throws(() => String(value), TypeError);
  assert.throws(() => value.valueOf(), TypeError);
  assert.deepEqual(Object.keys(value), []);
  assert(!('view' in value));
  assert(!('copy' in value));
  assert(!('debug' in value));
  assert(!kind.is(structuredClone(value)));
  observations(kind, value);
  copies(kind, value, equivalent);
}
export function assertValueLaws<
  K extends Semantic,
  const O extends ValueLawOptions<NoInfer<K>> & Record<keyof O, unknown>,
>(kind: K, options: Checked<O, ValueLawOptions<K>>): void {
  observationOf(kind);
  const check = (raw: z.input<K['codec']>) => {
    const a = parseCodec(kind.codec, raw);
    const repeated = parseCodec(kind.codec, raw);
    assert.equal(a, repeated, 'repeated decode identity');
    shared(kind, a, repeated);
    const encoded = encodeWire(kind.codec, a);
    const b = parseCodec(kind.codec, encoded);
    assert.equal(a, b, 'codec round-trip identity');
    assert.deepEqual(encodeWire(kind.codec, b), encoded);
    assert.equal(new Map([[a, 1]]).get(b), 1);
    assert.equal(new Set([a, b]).size, 1);
  };
  fc.assert(fc.property(options.validWire, check));
  if (options.equivalentAliases)
    fc.assert(
      fc.property(options.equivalentAliases, ([a, b]) => {
        const first = parseCodec(kind.codec, a);
        const alias = parseCodec(kind.codec, b);
        assert.equal(first, alias, 'normalized alias identity');
        copies(kind, first, alias);
      }),
    );
  const allocation = options as ValueLawOptions<K> & {
    allocateArgs?: fc.Arbitrary<any[]>;
  };
  if (allocation.allocateArgs)
    fc.assert(
      fc.property(allocation.allocateArgs, (args) => {
        const value = (kind as any).allocate(...args);
        shared(kind, value);
        assert.equal(value, parseCodec(kind.codec, encodeWire(kind.codec, value)));
      }),
    );
}
export function assertMintedLaws<
  K extends Minted,
  const O extends MintedLawOptions<NoInfer<K>> & Record<keyof O, unknown>,
>(kind: K, options: Checked<O, MintedLawOptions<K>>): void {
  observationOf(kind);
  fc.assert(
    fc.property(options.validInput, (input) => {
      const a = kind.mint(input),
        b = kind.mint(input);
      assert(a.ok && b.ok, 'generator must produce accepted inputs');
      assert.throws(() => kind.read(a), TypeError);
      shared(kind, a.value);
      observations(kind, b.value);
      assert.notEqual(a.value, b.value, 'each success is a distinct mint event');
      assert.equal(new Set([a.value, b.value]).size, 2);
    }),
  );
}
