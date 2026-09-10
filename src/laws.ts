// Node-only test entry. The core package does not import Node or fast-check.
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import type { z } from 'zod';
import { encodeWire, parseCodec } from './zod-codec.js';
import { foreignValue } from './sealed-leaf.js';
import { copyGraph } from './copy.js';
import { dataGraph } from './structure.js';
import type { AnyKind, ProducerResult, Proof, ConfigurationError } from './types.js';

type Semantic = AnyKind & { codec: z.ZodType<Proof<string>, any> };
type Minted = AnyKind & { mint(input: any): ProducerResult<any, unknown> };
type ValueLawOptions<K extends Semantic> = {
  validWire: fc.Arbitrary<z.input<K['codec']>>;
  equivalentAliases?: fc.Arbitrary<[z.input<K['codec']>, z.input<K['codec']>]>;
} & (K extends { allocate(...args: infer A): unknown }
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

function shared(kind: AnyKind, value: any): void {
  assert(Boolean(kind.is(value)), foreignValue(kind.name, value, 'laws'));
  for (const x of [kind, value, Object.getPrototypeOf(value)])
    assert(Object.isFrozen(x));
  assert(!kind.is(Object.create(Object.getPrototypeOf(value))));
  assert.throws(() => new value.constructor(), TypeError);
  assert.throws(() => JSON.stringify(value), TypeError);
  assert.throws(() => String(value), TypeError);
  assert.throws(() => value.valueOf(), TypeError);
  assert.deepEqual(Object.keys(value), []);
  assert(!kind.is(structuredClone(value)));
  if ('to' in value) {
    assert.equal(value.to, value.to);
    assert(Object.isFrozen(value.to));
    assert.equal(Object.getPrototypeOf(value.to), null);
    for (const name of Object.keys(value.to)) {
      const first = value.to[name]();
      const second = value.to[name]();
      assert.deepEqual(first, second, `to.${name} must produce equivalent data`);
      const nodes = copyGraph(first, `to.${name}`);
      const otherNodes = new Set(copyGraph(second, `to.${name}`));
      for (const node of nodes) {
        assert(!otherNodes.has(node), `to.${name} must not share objects across calls`);
        if (node instanceof ArrayBuffer && node.byteLength) {
          const bytes = new Uint8Array(node);
          bytes[0] = bytes[0]! ^ 255;
        } else if (node instanceof Date) node.setTime(0);
        else if (node instanceof Map) node.set('__law_probe__', true);
        else if (node instanceof Set) node.add('__law_probe__');
        else Reflect.set(node, '__law_probe__', true);
      }
      assert.deepEqual(
        value.to[name](),
        second,
        `to.${name} mutations must not affect later conversions`,
      );
    }
  }
  if ('view' in value) {
    assert.equal(value.view, value.view);
    assert(Object.isFrozen(value.view));
    assert.equal(Object.getPrototypeOf(value.view), null);
    for (const name of Object.keys(value.view)) {
      const first = value.view[name];
      assert.equal(first, value.view[name], `view.${name} must be stable`);
      for (const node of dataGraph(first, `view.${name}`, false)) {
        assert(Object.isFrozen(node), `view.${name} must be deeply frozen`);
        assert(!Reflect.set(node, '__law_probe__', true));
      }
    }
  }
}
export function assertValueLaws<
  K extends Semantic,
  const O extends ValueLawOptions<NoInfer<K>> & Record<keyof O, unknown>,
>(kind: K, options: Checked<O, ValueLawOptions<K>>): void {
  const check = (raw: z.input<K['codec']>) => {
    const a = parseCodec(kind.codec, raw);
    assert.equal(a, parseCodec(kind.codec, raw), 'repeated decode identity');
    shared(kind, a);
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
        assert.equal(
          parseCodec(kind.codec, a),
          parseCodec(kind.codec, b),
          'normalized alias identity',
        );
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
  fc.assert(
    fc.property(options.validInput, (input) => {
      const a = kind.mint(input),
        b = kind.mint(input);
      assert(a.ok && b.ok, 'generator must produce accepted inputs');
      shared(kind, a.value);
      assert.notEqual(a.value, b.value, 'each success is a distinct mint event');
      assert.equal(new Set([a.value, b.value]).size, 2);
    }),
  );
}
