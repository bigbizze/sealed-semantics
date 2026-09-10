import { ok, err } from './result.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import { z } from 'zod';
import { assertValueLaws, assertMintedLaws } from '../src/laws.js';
import { defineKind, defineMinted } from '../src/index.js';
import {
  UserId,
  Sha256Digest,
  NamespaceId,
  ContentAddress,
  PreparedWrite,
} from './reference.js';
const hex = (n: number) =>
  fc
    .array(fc.constantFrom(...'0123456789abcdef'), { minLength: n, maxLength: n })
    .map((a) => a.join(''));
const spelling = hex(32);
const uuid = spelling.map(
  (s) =>
    `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`,
);
const namespace = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'), {
    minLength: 1,
    maxLength: 20,
  })
  .map((a) => `ns:${a.join('')}`);
const address = fc.record({
  namespace_id: namespace,
  content_class: fc.constantFrom('primary' as const, 'attachment' as const),
  digest: hex(64),
});
test('all semantic reference laws, aliases, and allocation', () => {
  assertValueLaws(UserId, {
    validWire: fc.oneof(
      spelling.map((s) => `usr_${s}`),
      uuid.map((s) => `user:${s}`),
    ),
    equivalentAliases: uuid.map((s) => [`user:${s}`, `usr_${s.replaceAll('-', '')}`]),
    allocateArgs: uuid.map((s) => [() => s] as [() => string]),
  });
  assertValueLaws(Sha256Digest, { validWire: hex(64) });
  assertValueLaws(NamespaceId, { validWire: namespace });
  assertValueLaws(ContentAddress, {
    validWire: address,
  });
});
test('minted reference laws include copies of graphs with sealed nodes', () => {
  const sealed = address.map((w) => {
    return ContentAddress.codec.parse(w);
  });
  assertMintedLaws(PreparedWrite, {
    validInput: fc.record({
      rows: fc.array(fc.record({ id: fc.string(), content: sealed })),
      content: fc.array(sealed),
    }),
  });
});

test('laws accept shared immutable observations and detect invalid alias declarations', () => {
  const K = defineMinted({
    kind: 'law/shared',
    mint: (n: number) => ok({ nested: { n } }),
  })
    .view({ nested: (p) => p.nested })
    .seal();
  assertMintedLaws(K, { validInput: fc.integer() });
  const Id = defineKind({ kind: 'law/id', schema: z.string() }).seal();
  assert.throws(() =>
    assertValueLaws(Id, {
      validWire: fc.string(),
      equivalentAliases: fc.constant(['a', 'b']),
    }),
  );
});
test('laws exercise runtime rejection of unsupported observations', () => {
  const K = defineMinted({ kind: 'law/invalid-view', mint: (n: number) => ok(n) })
    .view({ bad: () => new Date() } as any)
    .seal();
  assert.throws(
    () => assertMintedLaws(K, { validInput: fc.integer() }),
    (e: any) => /unsupported object/.test(String(e.cause)),
  );
});
