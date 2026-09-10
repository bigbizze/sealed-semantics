import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import * as api from '../src/index.js';
import { defineKind, defineMinted } from '../src/index.js';
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
  assert.deepEqual(Object.keys(api).sort(), ['defineKind', 'defineMinted']);
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
  assert.throws(() => value.debug.call(fake), TypeError);
});

test('primitive kinds infer Parts and validate through all Zod boundary paths', async () => {
  const Id = defineKind({
    key: (parts) => parts,
    kind: 'runtime/identity',
    schema: z.string().min(2),
  })
    .view({ length: (text) => text.length })
    .seal();
  const a = Id.codec.parse('ab');
  assert.equal(a.view.length, 2);
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
  assert(NamespaceId.is(decoded.addresses[0]!.view.namespace));
  assert(Sha256Digest.is(decoded.addresses[0]!.view.digest));
  assert.deepEqual(z.encode(Contract, decoded), { user: current, addresses: [raw] });
});

test('Zod refinements and codec issues remain Zod errors in both directions', () => {
  const Limited = defineKind({
    key: (parts) => parts,
    kind: 'runtime/refined',
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

test('instances, kinds, prototypes, and lazy view facades have frozen surfaces', () => {
  const Parts = defineKind({
    kind: 'runtime/view',
    key: (p) => p.rows.join(','),
    schema: z.object({ rows: z.array(z.number()) }),
  })
    .view({ rows: (p) => [...p.rows] })
    .seal();
  const input = { rows: [1, 2] };
  const value = Parts.codec.parse(input);
  input.rows.push(3);
  assert.deepEqual(value.view.rows, [1, 2]);
  assert.throws(() => {
    // @ts-expect-error Views are deeply readonly.
    value.view.rows.push(4);
  }, TypeError);
  assert.deepEqual(value.view.rows, [1, 2]);
  for (const target of [Parts, value, Object.getPrototypeOf(value), value.view]) {
    assert(Object.isFrozen(target));
    assert(!Reflect.set(target, 'extra', 1));
    assert.throws(() => Object.setPrototypeOf(target, {}), TypeError);
  }
  assert.equal(value.view, value.view);
  assert.equal(Object.getPrototypeOf(value.view), null);
  assert.deepEqual(Object.keys(value.view), ['rows']);
  assert.deepEqual({ ...value }, {});
  assert.throws(
    () =>
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(value), 'view')!.get!.call(
        {},
      ),
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
  assert.deepEqual(a.value.view.rows, []);
  const error = {
    kind: 'runtime/rejection',
    reason: 'invalid_input' as const,
    issues: ['No'],
  };
  const Rejected = defineMinted({
    kind: 'runtime/rejection',
    mint: () => ({ ok: false as const, error }),
  }).seal();
  const result = Rejected.mint(undefined);
  assert(!result.ok);
  assert.equal(result.error, error);
});

test('allocation runs the codec and reports Zod errors', () => {
  const Allocated = defineKind({
    key: (parts) => parts,
    kind: 'runtime/allocated',
    schema: z.string().min(2),
    allocate: (s: string) => s,
  }).seal();
  assert(Allocated.is(Allocated.allocate('ab')));
  assert.throws(() => Allocated.allocate('x'), z.ZodError);
  const Zero = defineKind({
    key: (parts) => parts,
    kind: 'runtime/zero',
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
  const OneWay = defineKind({
    key: (parts) => parts,
    kind: 'runtime/one-way',
    schema: z.string().transform((s) => s.length),
  }).seal();
  const value = OneWay.codec.parse('abc');
  assert(OneWay.is(value));
  assert.throws(() => z.encode(OneWay.codec, value), /unidirectional transform/i);
  const Async = defineKind({
    key: (parts) => parts,
    kind: 'runtime/async',
    schema: z.string().refine(async (s) => s.length > 0),
  })
    .view({ count: (s) => s.length })
    .seal();
  const asynchronous = await Async.codec.parseAsync('3');
  assert(Async.is(asynchronous));
  assert.equal(asynchronous.view.count, 1);
  assert.equal(await z.encodeAsync(Async.codec, asynchronous), '3');
});
