import test from 'node:test';
import assert from 'node:assert/strict';
import { defineMint, type ProducerResult } from '../src/index.js';

test('producer domain errors pass through unchanged without added properties', () => {
  type Error = { code: 'unauthorized' } | { code: 'expired'; expiredAt: Date };
  const error: Error = { code: 'expired', expiredAt: new Date(0) };
  const failure = { ok: false as const, error };
  const K = defineMint({
    name: 'errors/payment',
    mint: (_input: string): ProducerResult<{ input: string }, Error> => failure,
  }).seal();
  const result = K.mint('x');
  assert.equal(result, failure);
  assert(!result.ok);
  assert.equal(result.error, error);
  assert.deepEqual(Object.keys(result.error), ['code', 'expiredAt']);
  const Primitive = defineMint({
    name: 'errors/string',
    mint: () => ({ ok: false as const, error: 'unauthorized' as const }),
  }).seal();
  const r = Primitive.mint(undefined);
  assert(!r.ok);
  assert.equal(r.error, 'unauthorized');
});
