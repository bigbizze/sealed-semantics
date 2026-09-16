import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { defineSeal, defineMint } from '../src/index.js';

test('each observation is lazy, cached once, deeply frozen, and preserves sealed leaf types', () => {
  const Id = defineSeal({
    key: (parts) => parts,
    name: 'view/id',
    schema: z.string(),
  }).seal();
  const id = Id.codec.parse('x');
  let calls = 0,
    emptyCalls = 0;
  const Batch = defineMint({
    name: 'view/batch',
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
  const first = Batch.users(value);
  assert.equal(first, Batch.users(value));
  assert.equal(calls, 1);
  assert.equal(emptyCalls, 0);
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
  const snapshot = Batch.read(value);
  assert.equal(snapshot, Batch.read(value));
  assert.equal(snapshot.users, first);
  assert.equal(snapshot.empty, undefined);
  assert.equal(calls, 1);
  assert.equal(emptyCalls, 1);
  assert.equal(Batch.empty(value), undefined);
  assert.equal(emptyCalls, 1);
});

test('view retries after evaluation or validation failure without caching invalid results', () => {
  let tries = 0;
  const K = defineMint({ name: 'view/retry', mint: () => ({ ok: true, value: 1 }) })
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
  const retry = (K as any).retry as (value: unknown) => unknown;
  assert.throws(() => retry(r.value), /first/);
  assert.throws(() => retry(r.value), /unsupported object/);
  const accepted = retry(r.value);
  assert.equal(retry(r.value), accepted);
  assert.equal(tries, 3);
});

test('read forces every projection and does not return a partial snapshot on failure', () => {
  let goodCalls = 0;
  let badCalls = 0;
  const K = defineMint({
    name: 'view/read-partial',
    mint: () => ({ ok: true, value: 1 }),
  })
    .view({
      good: () => {
        goodCalls++;
        return 1;
      },
      bad: () => {
        badCalls++;
        if (badCalls === 1) throw new Error('blocked');
        return 2;
      },
    })
    .seal();
  const r = K.mint(undefined);
  assert(r.ok);
  assert.throws(() => K.read(r.value), /blocked/);
  assert.equal(K.good(r.value), 1);
  assert.equal(goodCalls, 1);
  const snapshot = K.read(r.value);
  assert.equal(snapshot.good, 1);
  assert.equal(snapshot.bad, 2);
  assert.equal(K.read(r.value), snapshot);
  assert.equal(goodCalls, 1);
  assert.equal(badCalls, 2);
});

test('whole-read snapshots are owned and reused across projections', () => {
  const UserId = defineSeal({
    name: 'view/read-reuse-id',
    schema: z.string(),
    key: (id) => id,
  })
    .view({ suffix: (id) => id.slice(-6) })
    .seal();
  const owner = UserId.codec.parse('usr_abcdef');
  const Holder = defineMint({
    name: 'view/read-reuse-holder',
    mint: () => ({ ok: true as const, value: { owner } }),
  })
    .view({
      left: (p) => UserId.read(p.owner),
      right: (p) => UserId.read(p.owner),
    })
    .seal();
  const held = Holder.mint(undefined);
  assert(held.ok);
  const read = UserId.read(owner);
  assert.equal(Holder.left(held.value), read);
  assert.equal(Holder.right(held.value), read);
  assert.equal(Holder.left(held.value), Holder.right(held.value));
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
    const K = defineMint({
      name: `view/invalid-${i}`,
      mint: () => ({ ok: true, value: 0 }),
    })
      .view({ bad: () => ({ good, bad }) } as any)
      .seal();
    const r = K.mint(undefined);
    assert(r.ok);
    assert.throws(() => (K as any).bad(r.value), TypeError);
    assert(!Object.isFrozen(good));
    assert(!Object.isFrozen(good.nested));
  });
  assert.equal(reads, 0);
});

test('exposed Parts freeze safely, shared subgraphs work, and later codec/debug reads still work', () => {
  const K = defineSeal({
    name: 'view/parts',
    schema: z.object({ rows: z.array(z.number()) }),
    key: (p) => p.rows.join(','),
    debug: (p) => String(p.rows.length),
  })
    .view({ rows: (p) => p.rows, shared: (p) => ({ a: p.rows, b: p.rows }) })
    .seal();
  const value = K.codec.parse({ rows: [1, 2] });
  const rows = K.rows(value);
  assert(Object.isFrozen(rows));
  assert.equal(K.shared(value).a, K.shared(value).b);
  assert.equal(K.shared(value).a, rows);
  assert.deepEqual(z.encode(K.codec, value), { rows: [1, 2] });
  assert.equal(K.debug(value), '2');
  assert.equal(K.codec.parse({ rows: [1, 2] }), value);
});

test('a frozen prototype forgery cannot become sealed Parts', () => {
  const Id = defineSeal({
    key: (parts) => parts,
    name: 'view/real-leaf',
    schema: z.string(),
  }).seal();
  const real = Id.codec.parse('x');
  const fake = Object.freeze(Object.create(Object.getPrototypeOf(real)));
  const K = defineMint({
    name: 'view/forged-leaf',
    mint: () => ({ ok: true, value: fake }),
  })
    .view({ leaf: (p) => p })
    .seal();
  assert.throws(
    () => K.mint(undefined),
    /sealed-looking object.*another installed package copy.*imitations/,
  );
});

test('recursive projections fail without caching and simple falsy results cache', () => {
  let value: any;
  const K = defineMint({
    name: 'view/recursive',
    mint: () => ({ ok: true, value: 1 }),
  })
    .view({ self: (): unknown => K.self(value) })
    .seal();
  const result = K.mint(undefined);
  assert(result.ok);
  value = result.value;
  assert.throws(() => K.self(value), /recursive projection access/);
  assert.throws(() => K.self(value), /recursive projection access/);
  for (const [i, observation] of [false, 0, '', null, NaN, 1n, Symbol()].entries()) {
    let calls = 0;
    const F = defineMint({
      name: `view/falsy-${i}`,
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
    assert(Object.is(F.observation(r.value), F.observation(r.value)));
    assert.equal(calls, 1);
  }
});

test('a frozen hostile class with the kind symbol cannot impersonate a genuine leaf', () => {
  class Fake {
    get [Symbol.for('sealed-semantics.name')]() {
      return 'view/claimed-id';
    }
  }
  Object.freeze(Fake.prototype);
  const fake = Object.freeze(new Fake());
  assert.deepEqual(Reflect.ownKeys(fake), []);
  const Mint = defineMint({
    name: 'view/fake-output',
    mint: () => ({ ok: true, value: fake }),
  })
    .view({ leaf: (p) => p })
    .seal();
  assert.throws(
    () => Mint.mint(undefined),
    /sealed-looking object.*another installed package copy.*imitations/,
  );
  const K = defineSeal({
    name: 'view/fake-parts',
    schema: z.string().transform(() => ({ fake })),
    key: () => 1,
  }).seal();
  assert.throws(
    () => K.codec.parse('x'),
    /keyed Parts.*sealed-looking object.*another installed package copy.*imitations/,
  );
  const Id = defineSeal({
    key: (parts) => parts,
    name: 'view/local-leaf',
    schema: z.string(),
  }).seal();
  const value = Id.codec.parse('x');
  const Holder = defineMint({
    name: 'view/local-holder',
    mint: () => ({ ok: true, value }),
  })
    .view({ leaf: (p) => p })
    .seal();
  const held = Holder.mint(undefined);
  assert(held.ok);
  assert.equal(Holder.leaf(held.value), value);
  assert(Object.isFrozen(value.constructor));
  assert.throws(() => Object.setPrototypeOf(value.constructor, class {}), TypeError);
  const Base = Object.getPrototypeOf(value.constructor);
  assert.throws(() => new Base(), /Cannot construct/);
  assert.throws(() => new Base(Symbol()), /Cannot construct/);
});

test('duck-typed view objects cannot be observed through the kind', () => {
  const UserId = defineSeal({
    name: 'view/duck',
    schema: z.string(),
    key: (id) => id,
  })
    .view({ suffix: (id) => id.slice(-6) })
    .seal();
  const genuine = UserId.codec.parse('usr_abcdef');
  assert.equal(UserId.suffix(genuine), 'abcdef');
  assert.throws(
    () => (UserId.suffix as (value: unknown) => string)({ view: { suffix: 'abcdef' } }),
    TypeError,
  );
  assert.throws(
    () =>
      (UserId.read as (value: unknown) => { suffix: string })({
        view: { suffix: 'abcdef' },
      }),
    TypeError,
  );
  assert.equal(UserId.read(genuine).suffix, UserId.suffix(genuine));
});
