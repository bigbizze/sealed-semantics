import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import * as api from '../src/index.js';
import { defineSeal, defineMint } from '../src/index.js';
import { stableWireKey } from '../src/keying.js';
import {
  UserId,
  Sha256Digest,
  ContentAddress,
  NamespaceId,
  PreparedWrite,
} from './reference.js';
import { ok } from './result.js';

test('only Zod exposes boundary operations; private brands reject forgery and constructor recovery', () => {
  assert.deepEqual(Object.keys(api).sort(), ['defineMint', 'defineSeal']);
  const value = UserId.codec.parse('usr_0123456789abcdef');
  for (const name of [
    'parse',
    'parseSafe',
    'safeParse',
    'parseOrThrow',
    'decode',
    'encode',
    'equals',
    'map',
    'set',
  ]) {
    assert(!(name in UserId), name);
    assert(!(name in value), name);
  }
  const fake = Object.create(Object.getPrototypeOf(value));
  for (const bad of [fake, {}, new Proxy(value, {}), structuredClone(value), null]) {
    assert(!UserId.is(bad));
    assert(!z.safeEncode(UserId.codec, bad as any).success);
  }
  assert.throws(() => new (value.constructor as any)(), TypeError);
  assert.throws(() => new (value.constructor as any)(Symbol(), {}), TypeError);
  assert.throws(() => UserId.debug(fake), TypeError);
});

test('primitive kinds infer Parts and validate through all Zod boundary paths', async () => {
  const Id = defineSeal({
    key: (parts) => parts,
    name: 'runtime/identity',
    schema: z.string().min(2),
  })
    .view({ length: (text) => text.length })
    .seal();
  const a = Id.codec.parse('ab');
  assert.equal(Id.length(a), 2);
  assert.equal(z.decode(Id.codec, 'ab'), a);
  assert.equal(await Id.codec.parseAsync('ab'), a);
  assert.equal(z.encode(Id.codec, a), 'ab');
  assert(!Id.codec.safeParse(42).success);
  assert(!z.safeDecode(Id.codec, 'x').success);
  assert.throws(() => Id.codec.parse('x'), z.ZodError);
});

test('schema codecs normalize inputs, validate decoded Parts, and encode nested contracts', () => {
  const legacy = 'user:550e8400-e29b-41d4-a716-446655440000';
  const current = 'usr_550e8400e29b41d4a716446655440000';
  const a = UserId.codec.parse(legacy),
    b = z.decode(UserId.codec, current);
  assert.equal(a, b);
  assert.equal(z.encode(UserId.codec, a), current);
  // Accepted by the broad external grammar but rejected by the codec output schema.
  assert(!UserId.codec.safeParse(`user:${'-'.repeat(36)}`).success);
  const raw = {
    namespace_id: 'ns:example',
    content_class: 'primary' as const,
    digest: 'ab'.repeat(32),
  };
  const Contract = z.object({
    user: UserId.codec,
    addresses: z.array(ContentAddress.codec),
  });
  const decoded = Contract.parse({ user: legacy, addresses: [raw] });
  assert(ContentAddress.is(decoded.addresses[0]));
  assert(NamespaceId.is(ContentAddress.namespace(decoded.addresses[0]!)));
  assert(Sha256Digest.is(ContentAddress.digest(decoded.addresses[0]!)));
  assert.deepEqual(z.encode(Contract, decoded), { user: current, addresses: [raw] });
});

test('Zod refinements and codec issues remain Zod errors in both directions', () => {
  const Limited = defineSeal({
    key: (parts) => parts,
    name: 'runtime/refined',
    schema: z.codec(z.string(), z.number().min(0), {
      decode: (text, ctx) => {
        if (text === 'bad') {
          ctx.issues.push({
            code: 'custom',
            input: text,
            message: 'Cannot convert input',
          });
          return z.NEVER;
        }
        return Number(text);
      },
      encode: (n) => String(n),
    }),
  }).seal();
  const rejected = Limited.codec.safeParse('bad');
  assert(!rejected.success);
  assert.equal(rejected.error.issues[0]!.message, 'Cannot convert input');
  assert(!Limited.codec.safeParse('-1').success);
  const Positive = Limited.codec.refine(
    (v) => z.encode(Limited.codec, v) !== '0',
    'Must be positive',
  );
  assert(!z.safeEncode(Positive, Limited.codec.parse('0')).success);
  assert.equal(z.encode(Positive, Positive.parse('2')), '2');
});

test('instances, kinds, prototypes, and read snapshots have frozen surfaces', () => {
  const Parts = defineSeal({
    name: 'runtime/view',
    key: (p) => p.rows.join(','),
    schema: z.object({ rows: z.array(z.number()) }),
  })
    .view({ rows: (p) => [...p.rows] })
    .seal();
  const input = { rows: [1, 2] };
  const value = Parts.codec.parse(input);
  input.rows.push(3);
  assert.deepEqual(Parts.rows(value), [1, 2]);
  assert.throws(() => {
    // @ts-expect-error Views are deeply readonly.
    Parts.rows(value).push(4);
  }, TypeError);
  assert.deepEqual(Parts.rows(value), [1, 2]);
  const snapshot = Parts.read(value);
  for (const target of [Parts, value, Object.getPrototypeOf(value), snapshot]) {
    assert(Object.isFrozen(target));
    assert(!Reflect.set(target, 'extra', 1));
    assert.throws(() => Object.setPrototypeOf(target, {}), TypeError);
  }
  assert.equal(Parts.read(value), snapshot);
  assert.equal(Object.getPrototypeOf(snapshot), null);
  assert.deepEqual(Object.keys(snapshot), ['rows']);
  assert.deepEqual({ ...value }, {});
  assert.throws(
    () => (Parts.rows as (value: unknown) => readonly number[])({}),
    TypeError,
  );
  for (const attempt of [
    () => JSON.stringify(value),
    () => String(value),
    () => +value,
    () => value.valueOf(),
  ])
    assert.throws(attempt, /z.encode/);
  assert(!('view' in UserId.codec.parse('usr_0123456789abcdef')));
  assert(!('view' in value));
  assert(!('debug' in value));
});

test('minted construction preserves errors, identity, and producer-owned copies', () => {
  const input = { rows: [], content: [] };
  const a = PreparedWrite.mint(input),
    b = PreparedWrite.mint(input);
  assert(a.ok && b.ok);
  assert.notEqual(a.value, b.value);
  assert.equal(new Set([a.value, b.value]).size, 2);
  assert(!('codec' in PreparedWrite));
  assert(!('encode' in a.value));
  assert.throws(() => JSON.stringify(a.value), /no external representation/);
  assert.deepEqual(PreparedWrite.rows(a.value), []);
  const error = {
    name: 'runtime/rejection',
    reason: 'invalid_input' as const,
    issues: ['No'],
  };
  const Rejected = defineMint({
    name: 'runtime/rejection',
    mint: () => ({ ok: false as const, error }),
  }).seal();
  const result = Rejected.mint(undefined);
  assert(!result.ok);
  assert.equal(result.error, error);
});

test('allocation runs the codec and reports Zod errors', () => {
  const Allocated = defineSeal({
    key: (parts) => parts,
    name: 'runtime/allocated',
    schema: z.string().min(2),
    allocate: (s: string) => s,
  }).seal();
  assert(Allocated.is(Allocated.allocate('ab')));
  assert.throws(() => Allocated.allocate('x'), z.ZodError);
  const Zero = defineSeal({
    key: (parts) => parts,
    name: 'runtime/zero',
    schema: z.string(),
    allocate: () => 'ok',
  }).seal();
  assert.equal(z.encode(Zero.codec, Zero.allocate()), 'ok');
});

test('documentation wire comparison validates JSON and preserves negative zero', () => {
  assert.equal(stableWireKey({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(stableWireKey(-0), '-0');
  assert.notEqual(stableWireKey(-0), stableWireKey(0));
  assert.equal(stableWireKey(['a', true, null]), '["a",true,null]');
  const cycle: any = {};
  cycle.self = cycle;
  for (const bad of [
    NaN,
    Infinity,
    undefined,
    1n,
    new Date(),
    new Uint8Array(),
    () => 0,
    cycle,
    [, 1],
    {
      get x() {
        return 1;
      },
    },
    { [Symbol()]: 1 },
    Object.defineProperty({}, 'x', { value: 1 }),
  ])
    assert.throws(() => stableWireKey(bad), TypeError);
  const shared = { x: 1 };
  assert.equal(stableWireKey([shared, shared]), '[{"x":1},{"x":1}]');
  assert.equal(stableWireKey(Object.assign(Object.create(null), { x: 1 })), '{"x":1}');
});

test('one-way transforms require a codec for encoding; async schemas use Zod async APIs', async () => {
  const OneWay = defineSeal({
    key: (parts) => parts,
    name: 'runtime/one-way',
    schema: z.string().transform((s) => s.length),
  }).seal();
  const value = OneWay.codec.parse('abc');
  assert(OneWay.is(value));
  assert.throws(() => z.encode(OneWay.codec, value), /unidirectional transform/i);
  const Async = defineSeal({
    key: (parts) => parts,
    name: 'runtime/async',
    schema: z.string().refine(async (s) => s.length > 0),
  })
    .view({ count: (s) => s.length })
    .seal();
  const asynchronous = await Async.codec.parseAsync('3');
  assert(Async.is(asynchronous));
  assert.equal(Async.count(asynchronous), 1);
  assert.equal(await z.encodeAsync(Async.codec, asynchronous), '3');
});

test('kind-side observation rejects the forgery matrix and authenticates genuine instances', () => {
  const K = defineSeal({
    name: 'runtime/forged',
    schema: z.string().regex(/^usr_[a-f0-9]{16,}$/),
    key: (id) => id,
  })
    .view({ suffix: (id) => id.slice(-6) })
    .seal();
  const G = K.codec.parse('usr_0123456789abcdef');
  const Other = defineSeal({
    name: 'runtime/forged',
    schema: z.string().regex(/^usr_[a-f0-9]{16,}$/),
    key: (id) => id,
  })
    .view({ suffix: (id) => id.slice(-6) })
    .seal();
  const observe = (kind: { assert(x: unknown): unknown }, x: unknown) => {
    assert.throws(() => (kind as any).read(x), TypeError);
    assert.throws(() => (kind as any).debug(x), TypeError);
    assert.throws(() => kind.assert(x), TypeError);
    if ('suffix' in kind) assert.throws(() => (kind as any).suffix(x), TypeError);
    if ('n' in kind) assert.throws(() => (kind as any).n(x), TypeError);
    if ('bytes' in kind) assert.throws(() => (kind as any).bytes(x), TypeError);
  };
  const Bytes = defineSeal({
    name: 'runtime/forged-bytes',
    schema: z.string(),
    key: (id) => id,
  })
    .copy({ bytes: (id) => new TextEncoder().encode(id) })
    .seal();
  const bytesValue = Bytes.codec.parse('usr_0123456789abcdef');
  assert(K.is(G));
  assert.equal(K.suffix(G), 'abcdef');
  assert.equal(K.read(G).suffix, 'abcdef');
  assert.equal(K.assert(G), G);
  assert.equal(K.debug(G), 'runtime/forged');
  assert.deepEqual(
    Bytes.bytes(bytesValue),
    new TextEncoder().encode('usr_0123456789abcdef'),
  );
  assert.equal(z.encode(K.codec, G), 'usr_0123456789abcdef');
  for (const bad of [
    {},
    { view: { suffix: 'x' } },
    { suffix: 'x' },
    Object.create(Object.getPrototypeOf(G)),
    new Proxy(G, {}),
    structuredClone(G),
    Other.codec.parse('usr_0123456789abcdef'),
    null,
    undefined,
    1,
    'usr_0123456789abcdef',
  ]) {
    assert(!K.is(bad));
    observe(K, bad);
    observe(Bytes, bad);
    if (
      bad !== null &&
      bad !== undefined &&
      typeof bad !== 'string' &&
      typeof bad !== 'number'
    )
      assert(!z.safeEncode(K.codec, bad as any).success);
  }
  const Minted = defineMint({
    name: 'runtime/forged-mint',
    mint: () => ({ ok: true as const, value: { n: 1 } }),
  })
    .view({ n: (p) => p.n })
    .copy({ bytes: () => new Uint8Array([1, 2]) })
    .seal();
  const minted = Minted.mint(undefined);
  assert(minted.ok);
  assert.throws(() => (Minted.read as (x: unknown) => unknown)(minted), TypeError);
  assert.throws(() => (Minted.debug as (x: unknown) => unknown)(minted), TypeError);
  assert.throws(() => (Minted.n as (x: unknown) => unknown)(minted), TypeError);
  assert.throws(() => (Minted.bytes as (x: unknown) => unknown)(minted), TypeError);
  assert.equal(Minted.read(minted.value).n, 1);
  assert.equal(Minted.n(minted.value), 1);
  assert.equal(Minted.assert(minted.value), minted.value);
  assert.equal(Minted.debug(minted.value), 'runtime/forged-mint');
  assert.deepEqual(Minted.bytes(minted.value), new Uint8Array([1, 2]));
  for (const bad of [
    {},
    { view: { n: 1 } },
    minted,
    Object.create(Object.getPrototypeOf(minted.value)),
    new Proxy(minted.value, {}),
    structuredClone(minted.value),
    null,
    undefined,
    1,
  ]) {
    assert(!Minted.is(bad));
    observe(Minted, bad);
  }
});
