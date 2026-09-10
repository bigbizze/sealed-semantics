import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { defineSeal, defineMint } from '../src/index.js';
import { ok } from './result.js';

test('unknown definition options fail immediately', () => {
  for (const name of ['equals', 'intern', 'view', 'surprise'])
    assert.throws(
      () =>
        defineSeal({
          name: 'definition/retry',
          schema: z.string(),
          [name]: () => 0,
        } as any),
      /Unknown definition property/,
    );
  const K = defineSeal({
    key: (parts) => parts,
    name: 'definition/retry',
    schema: z.string(),
  }).seal();
  assert(K.is(K.codec.parse('x')));
});

test('declarations reject malformed schemas, callbacks, definition names, and minted options', () => {
  for (const spec of [
    null,
    [],
    {},
    { name: '' },
    { name: 'definition/bad', schema: {} },
    { name: 'definition/bad', schema: z.string(), equals: 1 },
  ])
    assert.throws(() => defineSeal(spec as any), TypeError);
  for (const spec of [
    { name: 'definition/minted', mint: 1 },
    { name: 'definition/minted', surprise: () => ok(1) },
    { name: 'definition/minted', mint: () => ok(1), schema: z.string() },
  ])
    assert.throws(() => defineMint(spec as any), TypeError);
  const K = defineMint({ name: 'definition/minted', mint: () => ok(1) }).seal();
  assert(K.mint(undefined).ok);
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
      { name: 'definition/descriptors', schema: z.string() },
      Object.getOwnPropertyDescriptors(extra),
    );
    assert.throws(() => defineSeal(spec as any), TypeError);
  }
  assert.equal(calls, 0);
});

test('reserved projection names and symbols cannot create conflicting surfaces', () => {
  const B = defineMint({ name: 'definition/views', mint: () => ok(0) });
  for (const name of [
    'mint',
    'view',
    'codec',
    'seal',
    'debug',
    'parts',
    'constructor',
    'toJSON',
    'then',
  ])
    assert.throws(() => B.view({ [name]: () => 0 } as any), /reserved/);
  assert.throws(() => B.view({ [Symbol.toPrimitive]: () => 0 } as any), /Symbol/);
  const k = B.view({}).seal();
  const value = k.mint(undefined);
  assert(value.ok);
  assert(!('view' in value.value));
});

test('builders capture callbacks and each seal creates a definition', () => {
  const spec = { name: 'definition/lifecycle' as const, mint: (s: string) => ok(s) };
  const B = defineMint(spec);
  spec.mint = () => ok('replaced');
  assert(Object.isFrozen(B));
  assert(!('mint' in B));
  const projections = { text: (p: string) => p };
  const configured = B.view(projections);
  projections.text = () => 'replaced';
  const K = configured.seal();
  assert.notEqual(K, configured.seal());
  const r = K.mint('original');
  assert(r.ok);
  assert.equal(r.value.view.text, 'original');
  assert.notEqual(B.seal(), K);
  assert(!('seal' in K));
  assert(!('docs' in K));
});

test('failed documentation can be corrected and docs precede completion', () => {
  const B = defineSeal({
    key: (parts) => parts,
    name: 'definition/docs-retry',
    schema: z.string().min(2),
  });
  assert.throws(
    () => B.docs({ examples: [{ input: 'x', encoded: 'x' }] }).seal(),
    /rejected/,
  );
  const documented = B.docs({ examples: [{ input: 'ok', encoded: 'ok' }] });
  assert(documented.view({}).seal().documentation);
  const K = documented.seal();
  assert.notEqual(K, documented.seal());
  assert(Object.isFrozen(K.documentation));
});

test('docs and view work in either order and seal completes both factories', () => {
  const B = defineSeal({ name: 'definition/order', schema: z.string(), key: (s) => s });
  const docs = {
    examples: [{ input: 'abc', encoded: 'abc' }] as const,
    view: { text: { description: 'Text', example: 'abc' } },
  };
  const projections = { text: (s: string) => s };
  const first = B.docs(docs).view(projections).seal();
  const second = B.view(projections).docs(docs).seal();
  for (const K of [first, second]) {
    assert.equal(K.name, 'definition/order');
    assert.equal(K.codec.parse('abc').view.text, 'abc');
    assert.deepEqual(K.documentation, docs);
    for (const method of ['docs', 'view', 'seal']) assert(!(method in K));
  }
  const M = defineMint({ name: 'definition/mint-order', mint: (s: string) => ok(s) });
  for (const K of [
    M.docs({ view: docs.view }).view(projections).seal(),
    M.view(projections).docs({ view: docs.view }).seal(),
  ]) {
    const result = K.mint('abc');
    assert(result.ok);
    assert.equal(result.value.view.text, 'abc');
    for (const method of ['docs', 'view', 'seal']) assert(!(method in K));
  }
  // Editing the view preserves docs; final runtime validation uses the new view.
  assert.throws(
    () => (B.docs(docs).view({ other: (s: string) => s }) as any).seal(),
    /view/,
  );
  assert.throws(() => (B.docs(docs) as any).seal(), /view/);
  assert.equal(
    B.docs(docs).view(projections).docs(docs).seal().codec.parse('abc').view.text,
    'abc',
  );
});
