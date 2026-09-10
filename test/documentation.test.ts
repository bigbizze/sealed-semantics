import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { defineKind, defineMinted } from '../src/index.js';
import { documentationEqual } from '../src/documentation-equal.js';
import {
  UserId,
  Sha256Digest,
  ContentAddress,
  NamespaceId,
  PreparedWrite,
} from '../examples/reference.js';
import { ok } from './result.js';

test('docs validate every input and normalized encoding at seal', () => {
  const B = defineKind({
    kind: 'docs/normalized',
    schema: z.codec(z.string(), z.string(), {
      decode: (s) => s.toLowerCase(),
      encode: (s) => s,
    }),
  });
  assert.throws(
    () =>
      B.docs({
        examples: [
          { input: 'OK', encoded: 'ok' },
          { input: 'WRONG', encoded: 'WRONG' },
        ],
      }).seal(),
    /examples\[1\].encoded/,
  );
  const K = B.docs({ examples: [{ input: 'OK', encoded: 'ok' }] }).seal();
  assert.equal(z.encode(K.codec, K.codec.parse('OK')), 'ok');
  assert(Object.isFrozen(K.documentation.examples));
  assert(Object.isFrozen(K.documentation.examples[0]));
});

test('docs reject schema failures, missing properties, obsolete canonical, and empty examples', () => {
  const B = defineKind({ kind: 'docs/strict', schema: z.string().regex(/^id_/) });
  for (const docs of [
    {},
    { examples: [] },
    { examples: [{ input: 'id_x' }] },
    { examples: [{ input: 'bad', encoded: 'bad' }] },
    { examples: [{ input: 'id_x', encoded: 'id_x', canonical: 'x' }] },
    { exampleWire: 'id_x' },
    { examples: [{ input: 'id_x', encoded: 'id_x' }], extra: true },
  ])
    assert.throws(() => B.docs(docs as any).seal(), TypeError);
  assert(B.docs({ examples: [{ input: 'id_x', encoded: 'id_x' }] }).seal());
});

test('docs round trips use the codec, including nested kinds', () => {
  const Child = defineKind({ kind: 'docs/child', schema: z.string() }).seal();
  const Parent = defineKind({
    kind: 'docs/parent',
    schema: z.object({ child: Child.codec }),
  })
    .docs({ examples: [{ input: { child: 'x' }, encoded: { child: 'x' } }] })
    .seal();
  const value = Parent.codec.parse({ child: 'x' });
  assert.deepEqual(z.encode(Parent.codec, value), { child: 'x' });
});

test('minted docs require exact view descriptions without running the producer', () => {
  let calls = 0;
  const B = defineMinted({
    kind: 'docs/minted',
    mint: () => {
      calls++;
      return ok({ n: 1 });
    },
  }).view({ count: (p) => p.n });
  for (const metadata of [
    {},
    { view: {} },
    { view: { count: { description: '' } } },
    { view: { count: { description: 'Count' }, extra: { description: 'No' } } },
    { view: { count: { description: 'Count' } }, examples: [] },
  ])
    assert.throws(() => B.docs(metadata as any).seal(), TypeError);
  const K = B.docs({ view: { count: { description: 'Count', example: 1 } } }).seal();
  assert.equal(calls, 0);
  assert(Object.isFrozen(K.documentation.view.count));
});

test('documentation rejects accessors and symbols without invoking getters', () => {
  const B = defineKind({ kind: 'docs/descriptors', schema: z.string() });
  let calls = 0;
  assert.throws(
    () =>
      B.docs({
        get examples() {
          calls++;
          return [{ input: 'x', encoded: 'x' }] as const;
        },
      }).seal(),
    /data property/,
  );
  assert.throws(
    () =>
      B.docs({
        examples: [{ input: 'x', encoded: 'x' }],
        [Symbol()]: true,
      } as any).seal(),
    /symbol/,
  );
  assert.equal(calls, 0);
  const K = B.seal();
  assert(!('documentation' in K));
});

test('docs samples remain caller-owned; metadata containers are frozen', () => {
  const sample = { data: [1, 2] };
  const K = defineKind({
    kind: 'docs/samples',
    schema: z.object({ data: z.array(z.number()) }),
  })
    .docs({ examples: [{ input: sample, encoded: { data: [1, 2] } }] })
    .seal();
  assert(!Object.isFrozen(sample));
  assert(!Object.isFrozen(sample.data));
  assert(Object.isFrozen(K.documentation));
});

test('reference definitions carry executable documentation', () => {
  for (const K of [UserId, Sha256Digest, ContentAddress, NamespaceId, PreparedWrite])
    assert('documentation' in K);
});

test('documentation comparison handles bytes, collections, cycles, and descriptors', () => {
  assert(documentationEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2])));
  assert(!documentationEqual(new Uint8Array([1]), new Uint8Array([2])));
  assert(documentationEqual(new Map([['x', 1]]), new Map([['x', 1]])));
  assert(documentationEqual(new Set([1]), new Set([1])));
  const a: any = {};
  const b: any = {};
  a.self = a;
  b.self = b;
  assert(documentationEqual(a, b));
  assert(!documentationEqual(-0, 0));
});
