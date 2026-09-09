import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import * as api from '../src/index.js';
import { defineValue, defineDerived, ok, err, type Result } from '../src/index.js';
import { stableWireKey } from '../src/keying.js';
import {
  UserId,
  Sha256Digest,
  ContentAddress,
  PreparedWrite,
} from '../examples/reference.js';
function value<T>(r: Result<T>): T {
  if (!r.ok) throw Error(JSON.stringify(r.error));
  return r.value;
}
const raw = 'usr_0123456789abcdef';
test('private brand, prototype forgery, constructor recovery, and hidden state', () => {
  const v = value(UserId.parse(raw)),
    fake = Object.create(Object.getPrototypeOf(v));
  assert(UserId.is(v));
  assert(!UserId.is(fake));
  assert(!UserId.is(new Proxy(v, {})));
  assert(!z.safeEncode(UserId.wire, fake).success);
  assert(!UserId.wire.out.safeParse(fake).success);
  assert.throws(
    () =>
      new (Object.getPrototypeOf(v).constructor)(
        Symbol('sealed-semantics/construct'),
        {},
      ),
    TypeError,
  );
  assert.throws(() => Object.getPrototypeOf(v).canonical.call(fake), TypeError);
  assert.throws(() => v.equals(fake), TypeError);
  assert.throws(() => Object.getPrototypeOf(v).encode.call(fake), TypeError);
  assert.deepEqual(Reflect.ownKeys(v), []);
  assert.deepEqual(Object.keys(api).sort(), [
    'defineDerived',
    'defineValue',
    'err',
    'ok',
  ]);
  for (const name of [
    'parts',
    'raw',
    'unwrap',
    'fromParts',
    'indexKey',
    'seal',
    'hasBrand',
    'unseal',
  ]) {
    assert(!(name in UserId));
    assert(!(name in v));
  }
  assert(!UserId.is(structuredClone(v)));
});
test('Result parse preserves producer error while codec emits a custom issue', () => {
  const error = {
    kind: 'test/reject',
    reason: 'invalid_parts' as const,
    issues: ['producer detail'],
  };
  const Reject = defineValue({
    kind: 'test/reject',
    wire: z.string(),
    decode: () => err(error),
  }).with({ toWireShape: () => '' });
  const r = Reject.parse('x');
  assert(!r.ok);
  assert.equal(r.error, error);
  const c = z.safeDecode(Reject.wire, 'x');
  assert(!c.success);
  assert.equal(c.error.issues[0]?.code, 'custom');
  assert.match(c.error.message, /producer detail/);
  assert.throws(() => z.decode(Reject.wire, 'x'), z.ZodError);
  const invalid = Reject.parse(5);
  assert(!invalid.ok);
  assert.equal(invalid.error.reason, 'invalid_wire');
  const badAllocate = defineValue({
    kind: 'test/bad-allocate',
    wire: z.string().min(2),
    decode: (w) => ok(w),
  }).with({ toWireShape: (p) => p, allocate: () => '' });
  assert.equal(badAllocate.allocate().ok, false);
  const D = defineDerived({
    kind: 'test/derive-error',
    derive: (_: unknown) => err({ ...error, reason: 'invalid_input' as const }),
  }).with({});
  assert.equal(D.derive(null).ok, false);
});
test('aliases and nested codecs encode the complete raw contract', () => {
  const a = value(UserId.parse('user:01234567-89ab-cdef-0123-456789abcdef'));
  const b = value(UserId.parse('usr_0123456789abcdef0123456789abcdef'));
  assert(a !== b);
  assert(a.equals(b));
  assert.deepEqual(a.encode(), b.encode());
  const w = {
    namespace_id: 'ns:hello',
    content_class: 'primary' as const,
    digest: 'ab'.repeat(32),
  };
  const address = value(ContentAddress.parse(w));
  assert(Sha256Digest.is(address.view.digest()));
  assert.deepEqual(address.encode(), w);
  assert.deepEqual(z.encode(z.object({ address: ContentAddress.wire }), { address }), {
    address: w,
  });
  assert(z.safeDecode(ContentAddress.wire, w).success);
  assert.deepEqual(z.encode(ContentAddress.wire, address), w);
});
test('semantic Map/Set behavior retains original keys without exposing internal strings', () => {
  const a = value(UserId.parse(raw)),
    b = value(UserId.parse(raw));
  const map = UserId.map<number>().set(a, 1).set(b, 2);
  assert.equal(map.size, 1);
  assert.equal(map.get(b), 2);
  assert.equal([...map.keys()][0], a);
  const entry = [...map][0]!;
  entry[1] = 99;
  assert.equal(map.get(a), 2);
  const context = { called: 0 };
  map.forEach(function (this: typeof context, v, k, m) {
    assert.equal(this, context);
    assert.equal(v, 2);
    assert.equal(k, a);
    assert.equal(m, map);
    this.called++;
  }, context);
  assert.equal(context.called, 1);
  const set = UserId.set().add(a).add(b);
  assert.equal(set.size, 1);
  assert.deepEqual([...set.entries()], [[a, a]]);
  assert.throws(() => map.has(Object.create(Object.getPrototypeOf(a))), TypeError);
  assert.throws(
    () => set.add(value(Sha256Digest.parse('ab'.repeat(32))) as any),
    TypeError,
  );
  assert(map.delete(b));
  assert(!map.has(a));
  set.clear();
  assert.equal(set.size, 0);
});
test('derived identity and producer copy obligations in reference example', () => {
  const address = value(
    ContentAddress.parse({
      namespace_id: 'ns:x',
      content_class: 'primary',
      digest: 'ab'.repeat(32),
    }),
  );
  const input = { rows: [{ id: 'first', content: address }], content: [address] };
  const a = value(PreparedWrite.derive(input)),
    b = value(PreparedWrite.derive(input));
  input.rows[0]!.id = 'changed';
  input.content.length = 0;
  assert.equal(a.view.rows()[0]!.id, 'first');
  assert.equal(a.view.contentToRetain()[0], address);
  assert(!a.equals(b));
  assert(a.equals(a));
  const map = PreparedWrite.map<number>().set(a, 1).set(b, 2);
  assert.equal(map.size, 2);
  const digest = value(Sha256Digest.parse('ab'.repeat(32)));
  digest.canonical().value.fill(0);
  assert.equal(digest.encode(), 'ab'.repeat(32));
});
test('duplicate definitions and invalid declarations fail', () => {
  assert.throws(
    () =>
      defineValue({
        kind: 'example/user-id',
        wire: z.string(),
        decode: (w) => ok(w),
      }).with({ toWireShape: (p) => p }),
    /Duplicate kind/,
  );
  assert.throws(
    () => defineDerived({ kind: 'example/user-id', derive: () => ok(1) }).with({}),
    /Duplicate kind/,
  );
  assert.throws(
    () => defineDerived({ kind: 'unqualified', derive: () => ok(1) }).with({}),
    /namespaced/,
  );
  assert.throws(
    () =>
      defineDerived({ kind: 'test/reserved', derive: () => ok(1) }).with({
        fields: { is: (p: number) => p },
      } as any),
    /Field name "is" is reserved/,
  );
});
test('deterministic JSON validates the entire runtime domain and preserves -0', () => {
  assert.equal(
    stableWireKey({ z: 1, a: [-0, '\n', true, null] }),
    '{"a":[-0,"\\n",true,null],"z":1}',
  );
  assert(Object.is(JSON.parse(stableWireKey(-0)), -0));
  for (const bad of [
    NaN,
    Infinity,
    -Infinity,
    undefined,
    1n,
    Symbol(),
    () => 0,
    new Date(),
    new Uint8Array(1),
    [undefined],
    Array(1),
    { n: Infinity },
    Object.defineProperty({}, 'x', {
      get() {
        throw Error('getter must not run');
      },
      enumerable: true,
    }),
  ])
    assert.throws(() => stableWireKey(bad), TypeError);
  const cyclic: any = {};
  cyclic.self = cyclic;
  assert.throws(() => stableWireKey(cyclic), TypeError);
  const shared = { a: 1 };
  assert.equal(stableWireKey([shared, shared]), '[{"a":1},{"a":1}]');
});
test('reference callbacks preserve observations across repeated calls', () => {
  const digest = value(Sha256Digest.parse('ab'.repeat(32)));
  const user = value(UserId.parse(raw));
  const address = value(
    ContentAddress.parse({
      namespace_id: 'ns:x',
      content_class: 'primary',
      digest: 'ab'.repeat(32),
    }),
  );
  const plan = value(
    PreparedWrite.derive({
      rows: [{ id: 'row', content: address }],
      content: [address],
    }),
  );
  const before = {
    user: user.encode(),
    digest: digest.encode(),
    address: address.encode(),
    rows: plan.view.rows(),
    content: plan.view.contentToRetain(),
  };
  for (let i = 0; i < 5; i++) {
    user.canonical();
    user.debug();
    user.equals(value(UserId.parse(raw)));
    digest.canonical();
    digest.debug();
    digest.equals(value(Sha256Digest.parse('ab'.repeat(32))));
    address.view.namespace();
    address.view.contentClass();
    address.view.digest();
    address.debug();
    plan.debug();
    plan.view.rows();
    plan.view.contentToRetain();
  }
  assert.deepEqual(
    {
      user: user.encode(),
      digest: digest.encode(),
      address: address.encode(),
      rows: plan.view.rows(),
      content: plan.view.contentToRetain(),
    },
    before,
  );
  assert.equal(UserId.parse('user:' + '-'.repeat(36)).ok, false);
});
test('view is lazy, stable, frozen, bound, and absent without declared fields', () => {
  let calls = 0;
  const K = defineValue({
    kind: 'amendment/view',
    wire: z.string(),
    decode: (w) => ok({ text: w }),
  }).with({
    toWireShape: (p) => p.text,
    fields: {
      text: (p) => {
        calls++;
        return p.text;
      },
    },
  });
  const a = value(K.parse('a')),
    b = value(K.parse('b'));
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(a), 'view')!;
  assert.equal(descriptor.enumerable, false);
  assert.equal(descriptor.set, undefined);
  assert.equal(calls, 0);
  const view = a.view;
  assert.equal(calls, 0);
  assert.equal(view, a.view);
  assert.notEqual(view, b.view);
  assert.equal(Object.getPrototypeOf(view), null);
  assert(Object.isFrozen(view));
  assert.deepEqual(Reflect.ownKeys(view), ['text']);
  assert.deepEqual(Reflect.ownKeys(a), []);
  assert.throws(
    () => Object.defineProperty(view, 'raw', { value: () => 0 }),
    TypeError,
  );
  const detached = view.text;
  assert.equal(detached(), 'a');
  assert.equal(detached.call(b), 'a');
  assert.throws(
    () => descriptor.get!.call(Object.create(Object.getPrototypeOf(a))),
    TypeError,
  );
  assert.throws(() => descriptor.get!.call(value(UserId.parse(raw))), TypeError);
  assert.throws(() => descriptor.get!.call(new Proxy(a, {})), TypeError);
  assert.deepEqual({ ...a }, {});
  assert.deepEqual(Object.keys(a), []);
  assert(!K.is(structuredClone(a)));
  assert(!('text' in K));
  assert(!('text' in a));
  assert(!('canonical' in K));
  assert(!('view' in value(UserId.parse(raw)))); // canonical alone does not add view
  const Empty = defineDerived({ kind: 'amendment/empty', derive: () => ok(0) }).with({
    fields: {},
  });
  assert(!('view' in value(Empty.derive(undefined))));
});
test('zero-argument allocator still validates and normalizes its wire output', () => {
  const K = defineValue({
    kind: 'amendment/allocate',
    wire: z.string().regex(/^user:|^usr_/),
    decode: (w) => ok(w.replace('user:', 'usr_')),
  }).with({ toWireShape: (p) => p, allocate: () => 'user:abc' });
  const v = value(K.allocate());
  assert(K.is(v));
  assert.equal(v.encode(), 'usr_abc');
  assert.equal(
    K.map<number>()
      .set(v, 1)
      .get(value(K.parse('usr_abc'))),
    1,
  );
});
test('all reserved field names are rejected with a descriptive error', () => {
  for (const name of [
    'view',
    'map',
    'set',
    'get',
    'value',
    'kind',
    'is',
    'parse',
    'derive',
    'wire',
    'allocate',
    'canonical',
    'encode',
    'equals',
    'debug',
    'parts',
    'raw',
    'unwrap',
    'fromParts',
    'indexKey',
    '__proto__',
    'constructor',
    'prototype',
    'then',
    'toJSON',
    'valueOf',
    'toString',
  ]) {
    const fields = Object.fromEntries([[name, (p: number) => p]]);
    assert.throws(
      () =>
        defineDerived({ kind: `amendment/reserved-${name}`, derive: () => ok(1) }).with(
          { fields } as any,
        ),
      {
        name: 'TypeError',
        message: `Field name "${name}" is reserved. Choose a different projection name.`,
      },
    );
  }
});

test('view cannot introduce a Symbol.toPrimitive projection', () => {
  assert.throws(
    () =>
      defineDerived({ kind: 'amendment/symbol', derive: () => ok(1) }).with({
        fields: { [Symbol.toPrimitive]: () => 1 },
      } as any),
    /Symbol-named fields are not supported/,
  );
});
test('instances and their prototypes have immutable public surfaces', () => {
  const semantic = value(
    ContentAddress.parse({
      namespace_id: 'ns:x',
      content_class: 'primary',
      digest: 'ab'.repeat(32),
    }),
  );
  const derived = value(PreparedWrite.derive({ rows: [], content: [] }));
  for (const v of [semantic, derived]) {
    assert(Object.isFrozen(v));
    assert(!Object.isExtensible(v));
    assert.equal(Reflect.set(v, 'extra', 123), false);
    assert.throws(() => Object.defineProperty(v, 'extra', { value: 123 }), TypeError);
    assert.throws(() => Object.setPrototypeOf(v, {}), TypeError);
    const p = Object.getPrototypeOf(v);
    assert(Object.isFrozen(p));
    assert.equal(
      Reflect.set(p, 'debug', () => 'changed'),
      false,
    );
    assert.throws(() => Object.setPrototypeOf(p, {}), TypeError);
    assert.equal(Reflect.deleteProperty(p, 'equals'), false);
    const facade = v.view;
    assert.equal(facade, v.view);
    assert(Object.isFrozen(facade));
    assert.deepEqual({ ...v }, {});
  }
  assert.equal(semantic.view.contentClass(), 'primary');
  assert.deepEqual(derived.view.rows(), []);
});
test('derived serialization errors do not recommend a nonexistent encoder', () => {
  const plan = value(PreparedWrite.derive({ rows: [], content: [] }));
  for (const operation of [
    () => JSON.stringify(plan),
    () => String(plan),
    () => `${plan}`,
    () => +plan,
    () => plan.valueOf(),
  ]) {
    assert.throws(operation, {
      name: 'TypeError',
      message:
        'example/prepared-write has no external representation and cannot be serialized',
    });
  }
});
test('kinds and builders cannot have acquisition or collection operations replaced', () => {
  const builder = defineValue({
    kind: 'hardening/frozen-kind',
    wire: z.string(),
    decode: (w) => ok(w),
  });
  const derivedBuilder = defineDerived({
    kind: 'hardening/frozen-derived',
    derive: (s: string) => ok(s),
  });
  for (const b of [builder, derivedBuilder]) {
    assert(Object.isFrozen(b));
    assert.equal(
      Reflect.set(b, 'with', () => null),
      false,
    );
    assert.throws(() => Object.setPrototypeOf(b, {}), TypeError);
  }
  const K = builder.with({ toWireShape: (p) => p, allocate: () => 'allocated' });
  const D = derivedBuilder.with({});
  for (const kind of [K, D]) {
    assert(Object.isFrozen(kind));
    for (const key of Object.keys(kind)) {
      const original = Reflect.get(kind, key);
      assert.equal(
        Reflect.set(kind, key, () => null),
        false,
      );
      assert.equal(Reflect.deleteProperty(kind, key), false);
      assert.equal(Reflect.get(kind, key), original);
    }
    assert.throws(() => Object.setPrototypeOf(kind, {}), TypeError);
    assert.equal(Reflect.set(kind, 'extra', 1), false);
  }
  const v = value(K.allocate());
  assert.equal(v.encode(), 'allocated');
  assert.equal(
    K.map<number>()
      .set(v, 1)
      .get(value(K.parse('allocated'))),
    1,
  );
  assert(D.is(value(D.derive('input'))));
});
