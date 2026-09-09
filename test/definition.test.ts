import { ok } from './result.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { defineKind, defineDerived } from '../src/index.js';

const spec = (kind: string) => ({
  kind,
  schema: z.string(),
  decode: (s: string) => ok(s),
  encode: (s: string) => s,
});
test('invalid semantic options fail before a kind is reserved', () => {
  for (const extra of [
    { encode: 1 },
    { encode: undefined },
    { canoncal: () => 1 },
    { equals: false },
    { allocate: 3 },
    { canonical: null },
    { debug: 'text' },
    { view: {} },
    { wire: z.string() },
    { toWireShape: () => '' },
  ]) {
    assert.throws(
      () => defineKind({ ...spec('validation/semantic'), ...extra } as any),
      TypeError,
    );
  }
  assert(
    defineKind({ ...spec('validation/semantic'), kind: 'validation/semantic' })
      .seal()
      .parse('x').ok,
  );
});
test('invalid derived options fail before a kind is reserved', () => {
  for (const extra of [
    { canonical: () => 1 },
    { schema: z.string() },
    { encode: () => '' },
    { allocate: () => '' },
    { equals: () => true },
    { debug: undefined },
    { view: {} },
    { typo: () => 0 },
  ]) {
    assert.throws(
      () =>
        defineDerived({
          kind: 'validation/derived',
          derive: (s: string) => ok(s),
          ...extra,
        } as any),
      TypeError,
    );
  }
  assert(
    defineDerived({ kind: 'validation/derived', derive: (s: string) => ok(s) })
      .seal()
      .derive('x').ok,
  );
});
test('producer declarations require known keys, schemas, and callback types', () => {
  for (const input of [
    null,
    [],
    {},
    { kind: 'validation/producer' },
    { ...spec('validation/producer'), schema: {} },
    { ...spec('validation/producer'), decode: null },
  ])
    assert.throws(() => defineKind(input as any), TypeError);
  for (const input of [
    null,
    [],
    {},
    { kind: 'validation/producer' },
    { kind: 'validation/producer', derive: 42 },
  ])
    assert.throws(() => defineDerived(input as any), TypeError);
  assert(
    defineKind({ ...spec('validation/producer'), kind: 'validation/producer' })
      .seal()
      .parse('x').ok,
  );
});
test('configuration accessors, hidden properties, and symbols are rejected without calling getters', () => {
  let reads = 0;
  const accessor = {
    ...spec('validation/descriptors'),
    get canonical() {
      reads++;
      return () => 0;
    },
  };
  const hidden = Object.defineProperty(spec('validation/descriptors'), 'canoncal', {
    value: () => 0,
  });
  for (const input of [
    accessor,
    hidden,
    { ...spec('validation/descriptors'), [Symbol()]: true },
  ])
    assert.throws(() => defineKind(input as any), TypeError);
  const b = defineDerived({ kind: 'validation/descriptors', derive: () => ok(0) });
  for (const view of [
    null,
    [],
    { text: 1 },
    {
      get text() {
        reads++;
        return () => 0;
      },
    },
    Object.defineProperty({}, 'text', { value: () => 0 }),
    { [Symbol()]: () => 0 },
  ])
    assert.throws(() => b.view(view as any), TypeError);
  assert.equal(reads, 0);
  assert(b.seal().derive(undefined).ok);
});
test('the former fields option is rejected before kind registration', () => {
  assert.throws(
    () =>
      defineDerived({
        kind: 'validation/old-fields',
        derive: () => ok(0),
        fields: {},
      } as any),
    /Unknown definition property "fields"/,
  );
  assert(
    Object.isFrozen(
      defineDerived({ kind: 'validation/old-fields', derive: () => ok(0) })
        .view({})
        .seal(),
    ),
  );
});
test('builders create no instances or registrations until seal and seal is stable', () => {
  const base = defineKind({ ...spec('lifecycle/stable'), kind: 'lifecycle/stable' });
  for (const name of ['parse', 'parseOrThrow', 'allocate', 'codec', 'is', 'map', 'set'])
    assert(!(name in base));
  const withView = base.view({ text: (p) => p });
  const documented = withView.docs({
    examples: [{ input: 'x', encoded: 'x' }],
    view: { text: { description: 'Text' } },
  });
  const kind = documented.seal();
  assert.equal(documented.seal(), kind);
  assert.equal(kind.parseOrThrow('x').view.text, 'x');
  for (const name of ['view', 'docs', 'seal', 'with']) assert(!(name in kind));
  assert.throws(() => base.seal(), /Duplicate kind/);
  assert.throws(
    () => defineDerived({ kind: 'lifecycle/stable', derive: () => ok(0) }).seal(),
    /Duplicate kind/,
  );
});
test('failed documentation does not reserve the kind and callbacks are captured', () => {
  const definition = { ...spec('lifecycle/docs'), kind: 'lifecycle/docs' as const };
  const base = defineKind(definition);
  definition.decode = () => ok('changed');
  const wrong = base.docs({ examples: [{ input: 'x', encoded: 'wrong' }] });
  assert.throws(() => wrong.seal(), /encoded does not match/);
  const kind = base.docs({ examples: [{ input: 'x', encoded: 'x' }] }).seal();
  assert.equal(kind.parseOrThrow('x').encode(), 'x');
});

test('view configuration is captured and empty views add no instance member', () => {
  const base = defineDerived({
    kind: 'lifecycle/view',
    derive: (text: string) => ok({ text }),
  });
  const projections = { text: (parts: { text: string }) => parts.text };
  const configured = base.view(projections);
  projections.text = () => 'changed';
  const kind = configured.seal();
  const result = kind.derive('original');
  assert(result.ok);
  assert.equal(result.value.view.text, 'original');
  assert(Object.isFrozen(result.value.view));
  const empty = defineDerived({ kind: 'lifecycle/no-view', derive: () => ok(0) })
    .view({})
    .seal();
  const instance = empty.derive(undefined);
  assert(instance.ok);
  assert(!('view' in instance.value));
});
