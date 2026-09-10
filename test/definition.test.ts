import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { defineKind, defineMinted } from '../src/index.js';
import { ok } from './result.js';

test('unknown options and removed conversion callbacks fail before registration', () => {
  for (const name of ['decode', 'encode', 'canonical', 'fields', 'view', 'canoncal'])
    assert.throws(
      () =>
        defineKind({
          kind: 'definition/retry',
          schema: z.string(),
          [name]: () => 0,
        } as any),
      /Unknown definition property/,
    );
  const K = defineKind({ kind: 'definition/retry', schema: z.string() }).seal();
  assert(K.is(K.codec.parse('x')));
  assert.throws(
    () => defineMinted({ kind: K.kind, mint: () => ok(0) }).seal(),
    /Duplicate kind/,
  );
});

test('declarations reject malformed schemas, callbacks, kind names, and minted options', () => {
  for (const spec of [
    null,
    [],
    {},
    { kind: 'invalid' },
    { kind: 'definition/bad', schema: {} },
    { kind: 'definition/bad', schema: z.string(), equals: 1 },
  ])
    assert.throws(() => defineKind(spec as any), TypeError);
  for (const spec of [
    { kind: 'definition/minted', mint: 1 },
    { kind: 'definition/minted', derive: () => ok(1) },
    { kind: 'definition/minted', mint: () => ok(1), schema: z.string() },
  ])
    assert.throws(() => defineMinted(spec as any), TypeError);
  const K = defineMinted({ kind: 'definition/minted', mint: () => ok(1) }).seal();
  assert(K.mint(undefined).ok);
  assert(!('derive' in K));
});

test('configuration accessors, symbols, and hidden properties are rejected without running getters', () => {
  let calls = 0;
  for (const extra of [
    Object.defineProperty({}, 'debug', {
      enumerable: true,
      get() {
        calls++;
        return () => '';
      },
    }),
    Object.defineProperty({}, 'debug', { value: () => '' }),
    { [Symbol()]: () => '' },
  ]) {
    const spec = Object.defineProperties(
      { kind: 'definition/descriptors', schema: z.string() },
      Object.getOwnPropertyDescriptors(extra),
    );
    assert.throws(() => defineKind(spec as any), TypeError);
  }
  assert.equal(calls, 0);
});

test('reserved projection names and symbols cannot create conflicting surfaces', () => {
  const B = defineMinted({ kind: 'definition/views', mint: () => ok(0) });
  for (const name of [
    'mint',
    'view',
    'codec',
    'seal',
    'equals',
    'debug',
    'parts',
    'constructor',
    'toJSON',
    'then',
    'encode',
    'canonical',
  ])
    assert.throws(() => B.view({ [name]: () => 0 } as any), /reserved/);
  assert.throws(() => B.view({ [Symbol.toPrimitive]: () => 0 } as any), /Symbol/);
  const k = B.view({}).seal();
  const value = k.mint(undefined);
  assert(value.ok);
  assert(!('view' in value.value));
});

test('builders register only at seal, capture callbacks, and complete once', () => {
  const spec = { kind: 'definition/lifecycle' as const, mint: (s: string) => ok(s) };
  const B = defineMinted(spec);
  spec.mint = () => ok('replaced');
  assert(Object.isFrozen(B));
  assert(!('mint' in B));
  const projections = { text: (p: string) => p };
  const configured = B.view(projections);
  projections.text = () => 'replaced';
  const K = configured.seal();
  assert.equal(K, configured.seal());
  const r = K.mint('original');
  assert(r.ok);
  assert.equal(r.value.view.text, 'original');
  assert.throws(() => B.seal(), /Duplicate kind/);
  assert(!('seal' in K));
  assert(!('docs' in K));
});

test('failed documentation leaves the name available and docs precede completion', () => {
  const B = defineKind({ kind: 'definition/docs-retry', schema: z.string().min(2) });
  assert.throws(
    () => B.docs({ examples: [{ input: 'x', encoded: 'x' }] }).seal(),
    /rejected/,
  );
  const documented = B.docs({ examples: [{ input: 'ok', encoded: 'ok' }] });
  assert.throws(() => (documented as any).view({}), /before/);
  const K = documented.seal();
  assert.equal(K, documented.seal());
  assert(Object.isFrozen(K.documentation));
});
