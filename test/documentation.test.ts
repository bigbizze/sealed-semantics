import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { defineKind, defineDerived } from '../src/index.js';
import { ok } from './result.js';

test('linked examples validate at sealing and verify normalization and canonical output', () => {
  let calls = 0;
  const Base = defineKind({
    kind: 'docs/user',
    schema: z.string().regex(/^(user:|usr_)[a-z]+$/),
    decode: (spelling) => {
      calls++;
      return ok({ spelling: spelling.replace('user:', 'usr_') });
    },
    encode: (p) => p.spelling,
    allocate: () => 'usr_abcdef',
    canonical: (p) => ({ type: 'utf8' as const, value: p.spelling }),
  }).view({ suffix: (p) => p.spelling.slice(-6) });
  const example = {
    input: 'user:abcdef',
    encoded: 'usr_abcdef',
    canonical: { type: 'utf8' as const, value: 'usr_abcdef' },
  };
  const metadata = {
    description: 'User',
    examples: [example] as [typeof example],
    view: { suffix: { description: 'Suffix', example: 'abcdef' } },
  };
  const configured = Base.docs(metadata);
  assert.equal(calls, 0, 'Documentation must not execute callbacks before seal');
  const Kind = configured.seal();
  assert(calls > 0);
  const afterSeal = calls;
  assert.equal(configured.seal(), Kind);
  assert.equal(calls, afterSeal);
  assert(!('documentation' in Base));
  for (const value of [
    Kind,
    Kind.documentation,
    Kind.documentation.examples,
    Kind.documentation.examples[0],
    Kind.documentation.view,
    Kind.documentation.view.suffix,
  ])
    assert(Object.isFrozen(value));
  metadata.view.suffix.description = 'Changed';
  example.input = 'usr_changed';
  assert.equal(Kind.documentation.view.suffix.description, 'Suffix');
  assert.equal(Kind.documentation.examples[0].input, 'user:abcdef');
  const parsed = Kind.allocate();
  assert(parsed.ok);
  assert.equal(Kind.map<number>().set(parsed.value, 1).get(parsed.value), 1);
  assert(calls > 0);
  assert(!('docs' in Kind));
  assert.equal(Kind.documentation.description, 'User');
});

test('documentation checks catch regex rejection, encoded drift, canonical drift, and every example', () => {
  const Base = defineKind({
    kind: 'docs/checks',
    schema: z.string().regex(/^valid$/),
    decode: (value) => ok(value),
    encode: (p) => p,
    canonical: (p) => ({ text: p }),
  });
  const good = { input: 'valid', encoded: 'valid', canonical: { text: 'valid' } };
  Base.docs({ examples: [good] }).seal();
  for (const [example, message] of [
    [{ ...good, input: 'garbage' }, /input was rejected by codec.safeDecode/],
    [{ ...good, encoded: 'wrong' }, /encoded does not match/],
    [{ ...good, canonical: { text: 'wrong' } }, /canonical does not match/],
  ] as const) {
    assert.throws(() => Base.docs({ examples: [good, example] }).seal(), message);
  }
  const Unstable = defineKind({
    kind: 'docs/unstable',
    schema: z.number(),
    decode: (value) => ok(value),
    encode: (p) => p + 1,
  });
  assert.throws(
    () => Unstable.docs({ examples: [{ input: 1, encoded: 2 }] }).seal(),
    /round trip/,
  );
});

test('docs checker enforces metadata completeness for JavaScript and any callers', () => {
  const Base = defineKind({
    kind: 'docs/completeness',
    schema: z.string(),
    decode: (value) => ok(value),
    encode: (p) => p,
    canonical: (p) => p,
  }).view({ text: (p) => p });
  const good = {
    examples: [{ input: 'x', encoded: 'x', canonical: 'x' }],
    view: { text: { description: 'Text' } },
  };
  for (const metadata of [
    {},
    { ...good, examples: [] },
    { ...good, examples: [{ input: 'x' }] },
    { ...good, examples: [{ input: 'x', encoded: 'x' }] },
    { ...good, view: {} },
    { ...good, view: { text: {} } },
    { ...good, view: { text: { description: ' ' } } },
    { ...good, view: { ...good.view, extra: { description: 'Extra' } } },
    { ...good, exampleWire: 'x' },
  ])
    assert.throws(() => Base.docs(metadata as any).seal());
  const Plain = defineKind({
    kind: 'docs/no-canonical',
    schema: z.string(),
    decode: (value) => ok(value),
    encode: (p) => p,
  });
  assert.throws(
    () =>
      Plain.docs({
        examples: [{ input: 'x', encoded: 'x', canonical: 'x' }],
      } as any).seal(),
    /unknown property canonical/,
  );
});

test('derived documentation checks descriptions without running the producer or freezing samples', () => {
  let calls = 0;
  const Base = defineDerived({
    kind: 'docs/derived',
    derive: (input: string) => {
      calls++;
      return ok(input);
    },
  }).view({ bytes: (p) => new TextEncoder().encode(p) });
  const bytes = new Uint8Array([1]);
  const Kind = Base.docs({
    view: { bytes: { description: 'UTF-8 bytes', example: bytes } },
  }).seal();
  assert.equal(calls, 0);
  bytes[0] = 2;
  assert.equal(Kind.documentation.view.bytes.example![0], 2);
  assert.throws(() => Base.docs({} as any).seal(), /view/);
  assert.throws(
    () => Base.docs({ ...Kind.documentation, examples: [] } as any).seal(),
    /unknown property examples/,
  );
  const Empty = defineDerived({ kind: 'docs/empty', derive: () => ok(0) })
    .docs({})
    .seal();
  assert(Object.isFrozen(Empty));
});

test('nested codec examples use raw input and output and reject invalid producer input', () => {
  const Child = defineKind({
    kind: 'docs/child',
    schema: z.string(),
    decode: (s) => ok(s.toLowerCase()),
    encode: (p) => p,
  }).seal();
  const Parent = defineKind({
    kind: 'docs/parent',
    schema: z.object({ child: Child.codec }),
    decode: (value) => ok(value),
    encode: (p) => p,
  })
    .docs({ examples: [{ input: { child: 'ABC' }, encoded: { child: 'abc' } }] })
    .seal();
  const Reject = defineKind({
    kind: 'docs/producer-reject',
    schema: z.string(),
    decode: () => ({
      ok: false,
      error: {
        kind: 'docs/producer-reject',
        reason: 'invalid_parts',
        issues: ['Rejected'],
      },
    }),
    encode: () => '',
  });
  assert.throws(
    () => Reject.docs({ examples: [{ input: 'x', encoded: 'x' }] }).seal(),
    /codec.safeDecode/,
  );
});

import * as reference from '../examples/reference.js';
test('all exported reference kinds have executable documentation', () => {
  for (const kind of [
    reference.UserId,
    reference.Sha256Digest,
    reference.NamespaceId,
    reference.ContentAddress,
    reference.PreparedWrite,
  ])
    assert(Object.hasOwn(kind, 'documentation'));
});

test('canonical documentation compares bytes, frozen records, collections, cycles and accessors', () => {
  const samples = () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    return {
      bytes: new Uint8Array([1, 2]),
      frozen: Object.freeze({ value: 'x' }),
      map: new Map([['x', { n: 1 }]]),
      set: new Set([1, 2]),
      cycle,
      get observed() {
        return { n: 1 };
      },
    };
  };
  const K = defineKind({
    kind: 'docs/structural',
    schema: z.string(),
    decode: (value) => ok(value),
    encode: (p) => p,
    canonical: samples,
  });
  K.docs({ examples: [{ input: 'x', encoded: 'x', canonical: samples() }] }).seal();
  const changed = samples();
  changed.bytes[1] = 3;
  assert.throws(
    () =>
      K.docs({ examples: [{ input: 'x', encoded: 'x', canonical: changed }] }).seal(),
    /canonical does not match/,
  );
  const accessor = samples();
  Object.defineProperty(accessor, 'observed', {
    enumerable: true,
    get: () => ({ n: 2 }),
  });
  assert.throws(
    () =>
      K.docs({ examples: [{ input: 'x', encoded: 'x', canonical: accessor }] }).seal(),
    /canonical does not match/,
  );
});

test('docs rejects accessor and symbol metadata before reading it, and remains optional', () => {
  const K = defineKind({
    kind: 'docs/descriptors',
    schema: z.string(),
    decode: (value) => ok(value),
    encode: (p) => p,
  });
  let reads = 0;
  assert.throws(
    () =>
      K.docs({
        get examples() {
          reads++;
          return [];
        },
      } as any).seal(),
    /data property/,
  );
  assert.equal(reads, 0);
  assert.throws(
    () =>
      K.docs({
        examples: [{ input: 'x', encoded: 'x' }],
        [Symbol()]: true,
      } as any).seal(),
    /symbol/,
  );
  assert.throws(() => K.docs(undefined as any).seal(), /must be an object/);
  assert(
    K.docs({ examples: [{ input: 'x', encoded: 'x' }] })
      .seal()
      .parse('x').ok,
  );
  assert.throws(
    () => defineDerived({ kind: 'docs/descriptors', derive: ok }).seal(),
    /Duplicate kind/,
  );
});
