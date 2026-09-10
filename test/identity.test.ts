import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import { defineKind, defineMinted } from '../src/index.js';
import { cleanup, makeInterner } from '../src/interner.js';
import type { SemanticKey } from '../src/types.js';

test('normalized Parts give reference identity, native collection lookup, and allocation identity', () => {
  const Id = defineKind({
    kind: 'identity/id',
    schema: z.string().toLowerCase(),
    allocate: (s: string) => s,
  }).seal();
  const a = Id.codec.parse('USR_1'),
    b = Id.codec.parse('usr_1');
  assert.equal(a, b);
  assert.equal(new Map([[a, 'one']]).get(b), 'one');
  assert.equal(new Set([a, b]).size, 1);
  assert.equal(Id.allocate('USR_1'), a);
  assert.equal(Id.codec.parse(z.encode(Id.codec, a)), a);
  for (let i = 0; i < 100; i++) Id.codec.parse(`usr_${i}`);
  assert.equal(Id.codec.parse('USR_1'), a);
  const Other = defineKind({ kind: 'identity/other', schema: z.string() }).seal();
  assert.notEqual(Other.codec.parse('usr_1'), a);
});

test('all primitive key types use Object.is identity after schema conversion', () => {
  const values = [0, -0, NaN, 1n, true, false, null, undefined, 'x'] as const;
  const K = defineKind({
    kind: 'identity/primitives',
    schema: z.string().transform((s) => values[Number(s)]),
  }).seal();
  assert.notEqual(K.codec.parse('0'), K.codec.parse('1'));
  for (let i = 0; i < values.length; i++)
    assert.equal(K.codec.parse(String(i)), K.codec.parse(String(i)));
  assert.notEqual(K.codec.parse('4'), K.codec.parse('5'));
  const SymbolParts = defineKind({
    kind: 'identity/symbol',
    schema: z.string().transform(() => Symbol()),
  } as any).seal();
  assert.throws(() => SymbolParts.codec.parse('x'), /semantic key must/);
});

test('keyed Parts are validated on first decode and collisions never substitute private state', () => {
  const C = defineKind({
    kind: 'identity/coordinate',
    schema: z.object({ lat: z.number(), lng: z.number() }),
    key: (p) => `${p.lat}:${p.lng}`,
  }).seal();
  assert.equal(C.codec.parse({ lat: 1, lng: 2 }), C.codec.parse({ lng: 2, lat: 1 }));
  const Bad = defineKind({
    kind: 'identity/bad-key',
    schema: z.object({ id: z.string(), version: z.number() }),
    key: () => 'same',
  }).seal();
  const first = Bad.codec.parse({ id: 'private-A', version: 1 });
  assert.throws(
    () => Bad.codec.parse({ id: 'private-B', version: 2 }),
    (error: unknown) => {
      assert(error instanceof TypeError);
      assert.match(
        error.message,
        /identity\/bad-key.*semantic identity collision.*"same"/,
      );
      assert(!error.message.includes('private-'));
      return true;
    },
  );
  assert.equal(Bad.codec.parse({ id: 'private-A', version: 1 }), first);
  const invalid = [
    new Map(),
    new Set(),
    new Uint8Array(),
    new (class {
      n = 1;
    })(),
    () => 0,
    { [Symbol()]: 1 },
    Object.defineProperty({}, 'x', { value: 1 }),
    [, 1],
  ];
  let reads = 0;
  invalid.push({
    get x() {
      reads++;
      return 1;
    },
  } as any);
  const cycle: any = {};
  cycle.self = cycle;
  invalid.push(cycle);
  invalid.forEach((value, i) => {
    const K = defineKind({
      kind: `identity/invalid-${i}`,
      schema: z.string().transform(() => value),
      key: () => 'x',
    }).seal();
    assert.throws(() => K.codec.parse('x'), /keyed Parts/);
  });
  assert.equal(reads, 0);
  const Missing = defineKind({
    kind: 'identity/missing-runtime-key',
    schema: z.object({ n: z.number() }),
  } as any).seal();
  assert.throws(() => Missing.codec.parse({ n: 1 }), /Non-primitive Parts require key/);
  const Wrong = defineKind({
    kind: 'identity/wrong-runtime-key',
    schema: z.object({ n: z.number() }),
    key: () => ({}),
  } as any).seal();
  assert.throws(() => Wrong.codec.parse({ n: 1 }), /semantic key must/);
});

test('collision guard supports Dates and sealed leaves without treating opaque lookalikes as data', () => {
  const DateKind = defineKind({
    kind: 'identity/date',
    schema: z.codec(z.string(), z.date(), {
      decode: (s) => new Date(s),
      encode: (d) => d.toISOString(),
    }),
    key: (d) => d.getTime(),
  })
    .view({ timestamp: (d) => d.getTime() })
    .seal();
  const a = DateKind.codec.parse('2020-01-01');
  assert.equal(a, DateKind.codec.parse('2020-01-01T00:00:00.000Z'));
  assert.equal(a.view.timestamp, 1577836800000);
  const Event = defineMinted({
    kind: 'identity/event',
    mint: () => ({ ok: true, value: 0 }),
  }).seal();
  const one = Event.mint(undefined),
    two = Event.mint(undefined);
  assert(one.ok && two.ok);
  const Holder = defineKind({
    kind: 'identity/holder',
    schema: z
      .string()
      .transform((s) => ({ child: s === 'one' ? one.value : two.value })),
    key: () => 1,
  }).seal();
  const held = Holder.codec.parse('one');
  assert.equal(held, Holder.codec.parse('one'));
  assert.throws(() => Holder.codec.parse('two'), /collision/);
});

test('stale cleanup cannot delete a replacement and current cleanup releases its entry', () => {
  const table = new Map<SemanticKey, WeakRef<object>>();
  const a = {},
    b = {};
  const old = new WeakRef(a),
    replacement = new WeakRef(b);
  table.set('K', old);
  table.set('K', replacement);
  cleanup(table, { key: 'K', ref: old });
  assert.equal(table.get('K'), replacement);
  cleanup(table, { key: 'K', ref: replacement });
  assert.equal(table.size, 0);
  const interner = makeInterner<object>();
  interner.put('x', a);
  assert.equal(interner.get('x'), a);
});

test('mint success is an event and inspection does not expose Parts or call debug', () => {
  let debugCalls = 0;
  const M = defineMinted({
    kind: 'identity/minted',
    mint: (input: string) => ({ ok: true, value: { input } }),
    debug: () => {
      debugCalls++;
      return 'SECRET';
    },
  }).seal();
  const a = M.mint('secret'),
    b = M.mint('secret');
  assert(a.ok && b.ok);
  assert.notEqual(a.value, b.value);
  assert.equal(inspect(a.value), 'Sealed<identity/minted>');
  assert.equal(
    Object.prototype.toString.call(a.value),
    '[object Sealed<identity/minted>]',
  );
  assert.equal(debugCalls, 0);
  assert.throws(() => JSON.stringify(a.value), /no external representation/);
  assert.equal(a.value.debug(), 'SECRET');
  assert.equal(debugCalls, 1);
});

test('missing weak runtime facilities fail at import with actionable diagnostics', () => {
  for (const name of ['WeakRef', 'FinalizationRegistry']) {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `globalThis.${name}=undefined; await import('./src/index.ts')`,
      ],
      { encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires WeakRef and FinalizationRegistry/);
    assert.match(result.stderr, /enable_weak_ref/);
  }
});

test('same-name definitions are independent and foreign diagnostics explain the attempted operation', () => {
  const A = defineKind({ kind: 'dup/id', schema: z.string() })
    .view({ text: (p) => p })
    .seal();
  const B = defineKind({ kind: 'dup/id', schema: z.string() })
    .view({ text: (p) => p })
    .seal();
  const C = defineKind({ kind: 'other/id', schema: z.string() }).seal();
  const a = A.codec.parse('x');
  assert(A.is(a));
  assert(!Boolean(B.is(a)));
  assert.equal(A.codec.parse('x'), a);
  assert.notEqual(B.codec.parse('x'), a);
  assert.throws(
    () => z.encode(B.codec, a),
    /codec encode.*dup\/id.*different definition instance.*re-executed.*two copies/,
  );
  assert.throws(
    () => z.encode(C.codec, a as any),
    /other\/id.*different kind \(dup\/id\)/,
  );
  const get = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(B.codec.parse('x')),
    'view',
  )!.get!;
  assert.throws(() => get.call(a), /view.*dup\/id.*different definition/);
  assert.equal(a.view.text, 'x');
  const M = defineMinted({
    kind: 'dup/mint',
    mint: () => ({ ok: true, value: 1 }),
  }).seal();
  const N = defineMinted({
    kind: 'dup/mint',
    mint: () => ({ ok: true, value: 1 }),
  }).seal();
  const m = M.mint(undefined),
    n = N.mint(undefined);
  assert(m.ok && n.ok);
  assert(!Boolean(N.is(m.value)));
  assert.throws(
    () => n.value.debug.call(m.value),
    /debug.*dup\/mint.*different definition/,
  );
  assert.equal(m.value.debug(), 'dup/mint');
  const symbol = Symbol.for('sealed-semantics.kind');
  assert.equal((a as any)[symbol], 'dup/id');
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(a), symbol)!;
  assert.equal(descriptor.enumerable, false);
  assert.equal(descriptor.set, undefined);
  assert(!Reflect.set(a, symbol, 'wrong'));
});

test('numeric identity and encoding preserve both zero signs in either parse order', () => {
  for (const inputs of [
    [0, -0],
    [-0, 0],
  ]) {
    const N = defineKind({ kind: 'identity/signed-zero', schema: z.number() }).seal();
    const a = N.codec.parse(inputs[0]),
      b = N.codec.parse(inputs[1]);
    assert.notEqual(a, b);
    assert(Object.is(z.encode(N.codec, a), inputs[0]));
    assert(Object.is(z.encode(N.codec, b), inputs[1]));
    assert.equal(N.codec.parse(inputs[0]), a);
    assert.equal(N.codec.parse(inputs[1]), b);
  }
  const NaNs = defineKind({ kind: 'identity/nan', schema: z.nan() }).seal();
  const n = NaNs.codec.parse(NaN);
  assert.equal(n, NaNs.codec.parse(NaN));
  assert(Number.isNaN(z.encode(NaNs.codec, n)));
});

test('explicit numeric keys distinguish zero signs while collision assertions remain active', () => {
  const K = defineKind({
    kind: 'identity/explicit-zero',
    schema: z.object({ n: z.number() }),
    key: (p) => p.n,
  }).seal();
  const a = K.codec.parse({ n: 0 }),
    b = K.codec.parse({ n: -0 });
  assert.notEqual(a, b);
  assert.equal(a, K.codec.parse({ n: 0 }));
  assert.equal(b, K.codec.parse({ n: -0 }));
});
