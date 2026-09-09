import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { defineValue, defineDerived, ok } from '../src/index.js';
import { assertValueDocs } from '../src/laws.js';

test('documentation preserves the producer, brand, collections, and frozen API', () => {
  let calls = 0;
  const Original = defineValue({
    kind: 'docs/user',
    wire: z.string().regex(/^usr_[a-z]+$/),
    decode: (spelling) => {
      calls++;
      return ok({ spelling });
    },
  }).with({
    toWireShape: (p) => p.spelling,
    allocate: () => 'usr_abcdef',
    canonical: (p) => ({ type: 'utf8' as const, value: p.spelling }),
    view: { suffix: (p) => p.spelling.slice(-6) },
  });
  const metadata = {
    description: 'User',
    exampleWire: 'usr_abcdef',
    exampleCanonical: { type: 'utf8' as const, value: 'usr_abcdef' },
    views: { suffix: { description: 'Suffix', example: 'abcdef' } },
  };
  const Kind = Original.docs(metadata);
  assert.equal(calls, 0);
  assert(!('documentation' in Original));
  assert(Object.isFrozen(Kind));
  assert(Object.isFrozen(Kind.documentation));
  assert(Object.isFrozen(Kind.documentation.views));
  assert(Object.isFrozen(Kind.documentation.views!.suffix));
  metadata.views.suffix.description = 'Changed';
  assert.equal(Kind.documentation.views!.suffix!.description, 'Suffix');
  assert.equal(Kind.parse, Original.parse);
  assert.equal(Kind.wire, Original.wire);
  assert.equal(Kind.is, Original.is);
  const parsed = Kind.allocate();
  assert(parsed.ok);
  assert(Original.is(parsed.value));
  assert.equal(Kind.map<number>().set(parsed.value, 1).get(parsed.value), 1);
  assert.equal(parsed.value.view.suffix, 'abcdef');
  assertValueDocs(Kind);
  const replacement = Kind.docs({ description: 'Replacement' });
  assert.equal(replacement.documentation.description, 'Replacement');
  assert.equal(Kind.documentation.description, 'User');
  assert(!('exampleWire' in replacement.documentation));
  assertValueDocs(replacement);
});

test('invalid documentation examples fail only in the explicit docs check', () => {
  const Kind = defineValue({
    kind: 'docs/regex',
    wire: z.string().regex(/^valid$/),
    decode: ok,
  }).with({ toWireShape: (p) => p });
  const Bad = Kind.docs({ exampleWire: 'garbage' });
  assert.throws(
    () => assertValueDocs(Bad),
    /docs\/regex: documentation.exampleWire was rejected/,
  );
  assert(Kind.parse('valid').ok);
  const Unstable = defineValue({ kind: 'docs/unstable', wire: z.number(), decode: ok })
    .with({ toWireShape: (p) => p + 1 })
    .docs({ exampleWire: 1 });
  assert.throws(() => assertValueDocs(Unstable), /round trip/);
});

test('derived documentation does not run the producer or freeze its examples', () => {
  let calls = 0;
  const Base = defineDerived({
    kind: 'docs/derived',
    derive: (input: string) => {
      calls++;
      return ok(input);
    },
  }).with({ view: { bytes: (p) => new TextEncoder().encode(p) } });
  const bytes = new Uint8Array([1]);
  const Kind = Base.docs({ views: { bytes: { example: bytes } } });
  assert.equal(calls, 0);
  assert.equal(Kind.derive, Base.derive);
  bytes[0] = 2;
  assert.equal(Kind.documentation.views!.bytes!.example![0], 2);
  assert(Object.isFrozen(Kind));
});
