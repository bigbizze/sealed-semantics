import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import { defineSeal, defineMint } from '../src/index.js';
import { cleanup, makeInterner } from '../src/interner.js';
import { sameParts } from '../src/structure.js';
import type { SemanticKey } from '../src/types.js';

test('normalized Parts give reference identity, native collection lookup, and allocation identity', () => {
  const Id = defineSeal({
    key: (parts) => parts,
    name: 'identity/id',
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
  const Other = defineSeal({
    key: (parts) => parts,
    name: 'identity/other',
    schema: z.string(),
  }).seal();
  assert.notEqual(Other.codec.parse('usr_1'), a);
});

test('all primitive key types use Object.is identity after schema conversion', () => {
  const values = [0, -0, NaN, 1n, true, false, null, undefined, 'x'] as const;
  const K = defineSeal({
    key: (parts) => parts,
    name: 'identity/primitives',
    schema: z.string().transform((s) => values[Number(s)]),
  }).seal();
  assert.notEqual(K.codec.parse('0'), K.codec.parse('1'));
  for (let i = 0; i < values.length; i++)
    assert.equal(K.codec.parse(String(i)), K.codec.parse(String(i)));
  assert.notEqual(K.codec.parse('4'), K.codec.parse('5'));
  const SymbolParts = defineSeal({
    key: (parts: symbol) => parts,
    name: 'identity/symbol',
    schema: z.string().transform(() => Symbol()),
  } as any).seal();
  assert.throws(() => SymbolParts.codec.parse('x'), /semantic key must/);
});

test('keyed Parts are validated on first decode and collisions never substitute private state', () => {
  const C = defineSeal({
    name: 'identity/coordinate',
    schema: z.object({ lat: z.number(), lng: z.number() }),
    key: (p) => `${p.lat}:${p.lng}`,
  }).seal();
  assert.equal(C.codec.parse({ lat: 1, lng: 2 }), C.codec.parse({ lng: 2, lat: 1 }));
  const Bad = defineSeal({
    name: 'identity/bad-key',
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
  const invalid: unknown[] = [
    new Date(),
    new Map(),
    new Set(),
    new WeakMap(),
    new WeakSet(),
    new ArrayBuffer(1),
    new SharedArrayBuffer(1),
    new DataView(new ArrayBuffer(1)),
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
    const K = defineSeal({
      name: `identity/invalid-${i}`,
      schema: z.string().transform(() => value),
      key: () => 'x',
    }).seal();
    assert.throws(() => K.codec.parse('x'), /keyed Parts/);
  });
  assert.equal(reads, 0);
  for (const schema of [z.string(), z.object({ n: z.number() })]) {
    assert.throws(
      () => defineSeal({ name: 'identity/missing-runtime-key', schema } as any),
      /definition.key must be a function/,
    );
  }
  const Wrong = defineSeal({
    name: 'identity/wrong-runtime-key',
    schema: z.object({ n: z.number() }),
    key: () => ({}),
  } as any).seal();
  assert.throws(() => Wrong.codec.parse({ n: 1 }), /semantic key must/);
});

test('semantic Parts snapshots isolate retained aliases and keep caller containers mutable', () => {
  const retained = { id: 'a', rows: [1, 2] };
  let keyCalls = 0;
  const K = defineSeal({
    name: 'identity/private-snapshot',
    schema: z.string().transform(() => retained),
    key: (p) => {
      keyCalls++;
      assert(Object.isFrozen(p));
      assert(Object.isFrozen(p.rows));
      assert.throws(() => (p.rows as number[]).push(3), TypeError);
      return p.id;
    },
    debug: (p) => p.rows.join(','),
  }).seal();
  const value = K.codec.parse('x');
  assert.equal(keyCalls, 1);
  assert(!Object.isFrozen(retained));
  assert(!Object.isFrozen(retained.rows));
  retained.rows[0] = 99;
  assert.equal(value.debug(), '1,2');
  assert.throws(() => K.codec.parse('x'), /semantic identity collision/);
  retained.rows[0] = 1;
  assert.equal(K.codec.parse('x'), value);
  retained.rows[1] = 100;
  assert.throws(() => K.codec.parse('x'), /semantic identity collision/);
});

test('semantic snapshots leave input containers mutable and preserve encoding', () => {
  const K = defineSeal({
    name: 'identity/input-snapshot',
    schema: z.codec(
      z.object({ id: z.string(), rows: z.array(z.number()) }),
      z.object({ id: z.string(), rows: z.array(z.number()) }),
      {
        decode: (input) => input,
        encode: (parts) => ({ id: parts.id, rows: [...parts.rows] }),
      },
    ),
    key: (p) => p.id,
  }).seal();
  const input = { id: 'a', rows: [1, 2] };
  const value = K.codec.parse(input);
  assert(!Object.isFrozen(input));
  assert(!Object.isFrozen(input.rows));
  input.rows.push(3);
  assert.deepEqual(z.encode(K.codec, value), { id: 'a', rows: [1, 2] });
  assert.equal(K.codec.parse({ id: 'a', rows: [1, 2] }), value);
  assert.throws(() => K.codec.parse(input), /semantic identity collision/);
});

test('schema encoders can receive frozen Parts snapshots', () => {
  const K = defineSeal({
    name: 'identity/frozen-encoder',
    schema: z.codec(
      z.string(),
      z.custom<{ rows: number[] }>(
        (input) =>
          typeof input === 'object' &&
          input !== null &&
          Array.isArray((input as { rows?: unknown }).rows),
      ),
      {
        decode: (input) => ({ rows: input.split(',').map(Number) }),
        encode: (parts) => {
          assert(Object.isFrozen(parts));
          assert(Object.isFrozen(parts.rows));
          assert.throws(() => parts.rows.push(3), TypeError);
          return parts.rows.join(',');
        },
      },
    ),
    key: (p) => p.rows.join(','),
  }).seal();
  const value = K.codec.parse('1,2');
  assert.equal(z.encode(K.codec, value), '1,2');
});

test('snapshot failure precedes key evaluation and intern-table mutation', () => {
  let current: any = Object.defineProperty({ nested: { rows: [1] } }, 'hidden', {
    value: 1,
  });
  let keyCalls = 0;
  const K = defineSeal({
    name: 'identity/snapshot-order',
    schema: z.string().transform(() => current),
    key: () => {
      keyCalls++;
      return 'x';
    },
  }).seal();
  assert.throws(() => K.codec.parse('x'), /accessors and hidden properties/);
  assert.equal(keyCalls, 0);
  assert(!Object.isFrozen(current));
  assert(!Object.isFrozen(current.nested));
  current = { nested: { rows: [1] } };
  const value = K.codec.parse('x');
  assert(K.is(value));
  assert.equal(keyCalls, 1);
});

test('Parts snapshots reject Dates and preserve sealed leaves as collision atoms', () => {
  const DateKind = defineSeal({
    name: 'identity/date',
    schema: z.string().transform((s) => new Date(s)) as any,
    key: (d: Date) => d.getTime(),
  }).seal();
  assert.throws(() => DateKind.codec.parse('2020-01-01'), /unsupported object/);

  const Event = defineMint({
    name: 'identity/event',
    mint: () => ({ ok: true, value: 0 }),
  }).seal();
  const one = Event.mint(undefined),
    two = Event.mint(undefined);
  assert(one.ok && two.ok);
  const Holder = defineSeal({
    name: 'identity/holder',
    schema: z
      .string()
      .transform((s) => ({ child: s === 'one' ? one.value : two.value })),
    key: () => 1,
  }).seal();
  const held = Holder.codec.parse('one');
  assert.equal(held, Holder.codec.parse('one'));
  assert.throws(() => Holder.codec.parse('two'), /collision/);
});

test('plain-object snapshots use canonical string property order', () => {
  const order = (value: object) => Object.keys(value).join('|');
  let semanticOrder = '';
  const S = defineSeal({
    key: (parts: object) => {
      semanticOrder = order(parts);
      return 'same';
    },
    name: 'identity/canonical-order',
    schema: z.unknown(),
    debug: (parts: object) => order(parts),
  } as any).seal();
  const source = Object.create(null);
  Object.defineProperty(source, '__proto__', {
    value: 'data',
    enumerable: true,
  });
  Object.assign(source, {
    z: 1,
    10: 'ten',
    2: 'two',
    a: 2,
    4294967294: 'max-index',
    4294967295: 'not-index',
  });
  const value = S.codec.parse(source);
  assert.equal(semanticOrder, '2|10|4294967294|4294967295|__proto__|a|z');
  assert.equal(value.debug(), semanticOrder);
  assert.equal(Object.getPrototypeOf(S.codec.parse(source).debug), Function.prototype);

  const M = defineMint({
    name: 'identity/canonical-mint',
    mint: () => ({ ok: true as const, value: source }),
    debug: (parts) => `${Object.getPrototypeOf(parts) === null}:${order(parts)}`,
  })
    .view({ snapshot: (parts) => parts })
    .seal();
  const minted = M.mint(undefined);
  assert(minted.ok);
  assert.equal(minted.value.debug(), `true:${semanticOrder}`);
  assert.equal(order(minted.value.view.snapshot as object), semanticOrder);
  assert.equal(
    Object.getOwnPropertyDescriptor(minted.value.view.snapshot as object, '__proto__')!
      .value,
    'data',
  );
});

test('mint snapshots preserve shared children, null prototypes, __proto__ data, and sealed leaves', () => {
  const Id = defineSeal({
    key: (parts) => parts,
    name: 'identity/snapshot-leaf',
    schema: z.string(),
  }).seal();
  const id = Id.codec.parse('leaf');
  const child = { count: 1 };
  const parts = Object.create(null);
  Object.defineProperty(parts, '__proto__', { value: 'data', enumerable: true });
  parts.child = child;
  parts.again = child;
  parts.leaf = id;
  const M = defineMint({
    name: 'identity/mint-snapshot',
    mint: () => ({ ok: true as const, value: parts }),
    debug: (p) => `${p.child.count}:${p.__proto__}`,
  })
    .view({ snapshot: (p) => p, leaf: (p) => p.leaf })
    .seal();
  const result = M.mint(undefined);
  assert(result.ok);
  assert(!Object.isFrozen(parts));
  assert(!Object.isFrozen(child));
  child.count = 2;
  const view = result.value.view.snapshot as any;
  assert.equal(Object.getPrototypeOf(view), null);
  assert.equal(Object.getOwnPropertyDescriptor(view, '__proto__')!.value, 'data');
  assert.equal(view.child, view.again);
  assert.equal(view.child.count, 1);
  assert.equal(view.leaf, id);
  assert.equal(result.value.view.leaf, id);
  assert.equal(result.value.debug(), '1:data');
});

test('snapshot validation preserves prototypes and rejects unsupported properties without getter reads', () => {
  let reads = 0;
  const accessor = {
    get x() {
      reads++;
      return 1;
    },
  };
  const hidden = Object.defineProperty({ id: 'hidden' }, 'secret', {
    value: 1,
  });
  const symbolKey = { id: 'symbol', [Symbol('secret')]: 1 };
  const sparse = [1, , 3];
  const extra = [1, 2] as number[] & { extra?: number };
  extra.extra = 3;
  const hiddenArray = Object.defineProperty([1, 2], 'secret', {
    value: 3,
  });
  for (const [label, value, pattern] of [
    ['accessor', accessor, /accessors and hidden properties/],
    ['hidden', hidden, /accessors and hidden properties/],
    ['symbol', symbolKey, /symbol keys/],
    ['sparse', sparse, /arrays must be dense/],
    ['extra', extra, /arrays cannot have extra properties/],
    ['hidden-array', hiddenArray, /arrays cannot have extra properties/],
  ] as const) {
    const K = defineSeal({
      name: `identity/snapshot-validation-${label}`,
      schema: z.unknown().transform(() => value),
      key: () => label,
    } as any).seal();
    assert.throws(() => K.codec.parse(undefined), pattern);
  }
  assert.equal(reads, 0);

  const plain = Object.defineProperty({ id: 'plain' }, '__proto__', {
    value: 'data',
    enumerable: true,
  });
  const nullProto = Object.create(null) as { id: string; child: { n: number } };
  nullProto.id = 'null';
  nullProto.child = { n: 1 };
  const P = defineSeal({
    name: 'identity/snapshot-prototype-preservation',
    schema: z
      .literal('plain')
      .or(z.literal('null'))
      .transform((value) => (value === 'plain' ? plain : nullProto)),
    key: (parts) => parts.id,
    debug: (parts) => {
      const snapshot = parts as { child?: { n: number } };
      return `${Object.getPrototypeOf(parts) === null}:${Object.getOwnPropertyDescriptor(parts, '__proto__')?.value ?? ''}:${snapshot.child?.n ?? ''}`;
    },
  }).seal();
  assert.equal(P.codec.parse('plain').debug(), 'false:data:');
  assert.equal(P.codec.parse('null').debug(), 'true::1');
});

test('collision comparison treats one-to-one alias topology as semantic', () => {
  let current: unknown;
  const K = defineSeal({
    key: () => 'alias',
    name: 'identity/alias-topology',
    schema: z.unknown().transform(() => current),
  } as any).seal();

  const shared = { n: 1 };
  const first = { left: shared, right: shared };
  current = first;
  const value = K.codec.parse(first);
  assert.equal(K.codec.parse(first), value);

  current = { left: { n: 1 }, right: { n: 1 } };
  assert.throws(() => K.codec.parse(undefined), /semantic identity collision/);

  const D = defineSeal({
    key: () => 'dup',
    name: 'identity/duplicate-topology',
    schema: z.unknown().transform(() => current),
  } as any).seal();
  current = { left: { n: 1 }, right: { n: 1 } };
  const duplicated = D.codec.parse(undefined);
  assert.equal(D.codec.parse(undefined), duplicated);
  const laterShared = { n: 1 };
  current = { left: laterShared, right: laterShared };
  assert.throws(() => D.codec.parse(undefined), /semantic identity collision/);

  const a = { n: 1 };
  const b = { n: 1 };
  assert(sameParts({ left: a, right: b }, { left: b, right: a }));
  assert(!sameParts({ left: a, right: a }, { left: { n: 1 }, right: a }));
  assert(!sameParts({ left: { n: 1 }, right: a }, { left: a, right: a }));
});

test('mint failures pass through but invalid successful Parts throw misuse errors', () => {
  const error = { code: 'rejected' as const };
  let success = false;
  const M = defineMint({
    name: 'identity/mint-invalid',
    mint: () =>
      success
        ? ({ ok: true as const, value: new Date() } as any)
        : { ok: false as const, error },
  }).seal();
  const rejected = M.mint(undefined);
  assert(!rejected.ok);
  assert.equal(rejected.error, error);
  success = true;
  assert.throws(() => M.mint(undefined), /successful mint Parts.*unsupported object/);
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
  const M = defineMint({
    name: 'identity/minted',
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
  const A = defineSeal({ key: (parts) => parts, name: 'dup/id', schema: z.string() })
    .view({ text: (p) => p })
    .seal();
  const B = defineSeal({ key: (parts) => parts, name: 'dup/id', schema: z.string() })
    .view({ text: (p) => p })
    .seal();
  const C = defineSeal({
    key: (parts) => parts,
    name: 'other/id',
    schema: z.string(),
  }).seal();
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
    /other\/id.*different definition \(dup\/id\)/,
  );
  const get = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(B.codec.parse('x')),
    'view',
  )!.get!;
  assert.throws(() => get.call(a), /view.*dup\/id.*different definition/);
  assert.equal(a.view.text, 'x');
  const M = defineMint({
    name: 'dup/mint',
    mint: () => ({ ok: true, value: 1 }),
  }).seal();
  const N = defineMint({
    name: 'dup/mint',
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
  const symbol = Symbol.for('sealed-semantics.name');
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
    const N = defineSeal({
      key: (parts) => parts,
      name: 'identity/signed-zero',
      schema: z.number(),
    }).seal();
    const a = N.codec.parse(inputs[0]),
      b = N.codec.parse(inputs[1]);
    assert.notEqual(a, b);
    assert(Object.is(z.encode(N.codec, a), inputs[0]));
    assert(Object.is(z.encode(N.codec, b), inputs[1]));
    assert.equal(N.codec.parse(inputs[0]), a);
    assert.equal(N.codec.parse(inputs[1]), b);
  }
  const NaNs = defineSeal({
    key: (parts) => parts,
    name: 'identity/nan',
    schema: z.nan(),
  }).seal();
  const n = NaNs.codec.parse(NaN);
  assert.equal(n, NaNs.codec.parse(NaN));
  assert(Number.isNaN(z.encode(NaNs.codec, n)));
});

test('explicit numeric keys distinguish zero signs while collision assertions remain active', () => {
  const K = defineSeal({
    name: 'identity/explicit-zero',
    schema: z.object({ n: z.number() }),
    key: (p) => p.n,
  }).seal();
  const a = K.codec.parse({ n: 0 }),
    b = K.codec.parse({ n: -0 });
  assert.notEqual(a, b);
  assert.equal(a, K.codec.parse({ n: 0 }));
  assert.equal(b, K.codec.parse({ n: -0 }));
});

test('primitive key collisions reject unnormalized Parts', () => {
  const K = defineSeal({
    name: 'identity/primitive-collision',
    schema: z.string(),
    key: (s) => s.toLowerCase(),
  }).seal();
  const first = K.codec.parse('ABC');
  assert.throws(() => K.codec.parse('abc'), /semantic identity collision/);
  assert.equal(K.codec.parse('ABC'), first);
  assert.equal(z.encode(K.codec, first), 'ABC');
});
