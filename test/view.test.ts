import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { defineKind, defineMinted } from '../src/index.js';

test('each observation is lazy, cached once, deeply frozen, and preserves sealed leaf types', () => {
  const Id = defineKind({ kind: 'view/id', schema: z.string() }).seal();
  const id = Id.codec.parse('x');
  let calls = 0,
    emptyCalls = 0;
  const Batch = defineMinted({
    kind: 'view/batch',
    mint: (users: readonly (typeof id)[]) => ({
      ok: true,
      value: { users: [...users] },
    }),
  })
    .view({
      users: (p) => {
        calls++;
        return { nested: [{ users: p.users }] };
      },
      empty: () => {
        emptyCalls++;
        return undefined;
      },
    })
    .seal();
  const result = Batch.mint([id]);
  assert(result.ok);
  const value = result.value;
  assert.equal(calls, 0);
  const facade = value.view;
  assert.equal(calls, 0);
  const first = facade.users;
  assert.equal(first, facade.users);
  assert.equal(calls, 1);
  assert.equal(first.nested[0]!.users[0], id);
  assert.equal(z.encode(Id.codec, first.nested[0]!.users[0]!), 'x');
  assert.throws(() => {
    // @ts-expect-error Nested arrays are deeply readonly.
    first.nested[0]!.users.push(id);
  }, TypeError);
  assert.throws(() => {
    // @ts-expect-error Nested records are deeply readonly.
    first.nested[0]!.users = [];
  }, TypeError);
  assert.equal(facade.empty, undefined);
  assert.equal(facade.empty, undefined);
  assert.equal(emptyCalls, 1);
});

test('view retries after evaluation or validation failure without caching invalid results', () => {
  let tries = 0;
  const K = defineMinted({ kind: 'view/retry', mint: () => ({ ok: true, value: 1 }) })
    .view({
      retry: () => {
        tries++;
        if (tries === 1) throw Error('first');
        if (tries === 2) return new Date();
        return { ok: true };
      },
    } as any)
    .seal();
  const r = K.mint(undefined);
  assert(r.ok);
  const v = (r.value as any).view;
  assert.throws(() => v.retry, /first/);
  assert.throws(() => v.retry, /unsupported object/);
  const accepted = v.retry;
  assert.equal(v.retry, accepted);
  assert.equal(tries, 3);
});

test('unsupported view outputs fail on first access without executing accessors or freezing partial graphs', () => {
  let reads = 0;
  const cyclic: any = {};
  cyclic.self = cyclic;
  const invalid = [
    () => 0,
    new Date(),
    new Map(),
    new Set(),
    new (class {
      n = 1;
    })(),
    { [Symbol()]: 1 },
    cyclic,
    {
      get x() {
        reads++;
        return 1;
      },
    },
    [, 1],
    Object.defineProperty({}, 'x', { value: 1 }),
  ];
  invalid.forEach((bad, i) => {
    const good = { nested: [1] };
    const K = defineMinted({
      kind: `view/invalid-${i}`,
      mint: () => ({ ok: true, value: 0 }),
    })
      .view({ bad: () => ({ good, bad }) } as any)
      .seal();
    const r = K.mint(undefined);
    assert(r.ok);
    assert.throws(() => (r.value as any).view.bad, TypeError);
    assert(!Object.isFrozen(good));
    assert(!Object.isFrozen(good.nested));
  });
  assert.equal(reads, 0);
});

test('exposed Parts freeze safely, shared subgraphs work, and later codec/debug reads still work', () => {
  const K = defineKind({
    kind: 'view/parts',
    schema: z.object({ rows: z.array(z.number()) }),
    key: (p) => p.rows.join(','),
    debug: (p) => String(p.rows.length),
  })
    .view({ rows: (p) => p.rows, shared: (p) => ({ a: p.rows, b: p.rows }) })
    .seal();
  const value = K.codec.parse({ rows: [1, 2] });
  const rows = value.view.rows;
  assert(Object.isFrozen(rows));
  assert.equal(value.view.shared.a, value.view.shared.b);
  assert.deepEqual(z.encode(K.codec, value), { rows: [1, 2] });
  assert.equal(value.debug(), '2');
  assert.equal(K.codec.parse({ rows: [1, 2] }), value);
});

test('a frozen prototype forgery cannot become a sealed view leaf', () => {
  const Id = defineKind({ kind: 'view/real-leaf', schema: z.string() }).seal();
  const real = Id.codec.parse('x');
  const fake = Object.freeze(Object.create(Object.getPrototypeOf(real)));
  const K = defineMinted({
    kind: 'view/forged-leaf',
    mint: () => ({ ok: true, value: fake }),
  })
    .view({ leaf: (p) => p })
    .seal();
  const result = K.mint(undefined);
  assert(result.ok);
  assert.throws(() => result.value.view.leaf, /unsupported object/);
});

test('recursive projections fail without caching and simple falsy results cache', () => {
  let value: any;
  const K = defineMinted({
    kind: 'view/recursive',
    mint: () => ({ ok: true, value: 1 }),
  })
    .view({ self: (): unknown => value.view.self })
    .seal();
  const result = K.mint(undefined);
  assert(result.ok);
  value = result.value;
  assert.throws(() => value.view.self, /recursive projection access/);
  assert.throws(() => value.view.self, /recursive projection access/);
  for (const [i, observation] of [false, 0, '', null, NaN, 1n, Symbol()].entries()) {
    let calls = 0;
    const F = defineMinted({
      kind: `view/falsy-${i}`,
      mint: () => ({ ok: true, value: 0 }),
    })
      .view({
        observation: () => {
          calls++;
          return observation;
        },
      })
      .seal();
    const r = F.mint(undefined);
    assert(r.ok);
    assert(Object.is(r.value.view.observation, r.value.view.observation));
    assert.equal(calls, 1);
  }
});
