import { z } from 'zod';
import { defineValue, defineDerived, ok, err, type ValueOf } from '../src/index.js';
export const normalizeUserSpelling = (w: string) =>
  w.startsWith('user:') ? `usr_${w.slice(5).replaceAll('-', '')}` : w;
export const hexToBytes = (hex: string) =>
  Uint8Array.from(hex.match(/../g)!, (pair) => parseInt(pair, 16));
export const bytesToHex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
export const UserId = defineValue({
  kind: 'example/user-id',
  wire: z.string().regex(/^(usr_[a-f0-9]{16,}|user:[0-9a-f-]{36})$/),
  decode: (w) => {
    const spelling = normalizeUserSpelling(w);
    return /^usr_[a-f0-9]{16,}$/.test(spelling)
      ? ok({ spelling })
      : err({
          kind: 'example/user-id',
          reason: 'invalid_parts',
          issues: ['Invalid alias'],
        } as const);
  },
}).with({
  toWireShape: (p) => p.spelling,
  allocate: (gen: () => string) => `user:${gen()}`,
  canonical: (p) => ({ type: 'utf8', value: p.spelling }),
  debug: (p) => `user(…${p.spelling.slice(-6)})`,
});
export type UserId = ValueOf<typeof UserId>;
export const Sha256Digest = defineValue({
  kind: 'example/sha256',
  wire: z.string().regex(/^[a-f0-9]{64}$/),
  decode: (hex) => ok({ bytes: hexToBytes(hex) }),
}).with({
  toWireShape: (p) => bytesToHex(p.bytes),
  equals: (a, b) => constantTimeEqual(a.bytes, b.bytes),
  canonical: (p) => ({ type: 'bytes', value: p.bytes.slice() }),
});
export const NamespaceId = defineValue({
  kind: 'example/namespace-id',
  wire: z.string().regex(/^ns:[a-z]+$/),
  decode: (w) => ok(w),
}).with({ toWireShape: (p) => p });
export const ContentAddress = defineValue({
  kind: 'example/content-address',
  wire: z.object({
    namespace_id: NamespaceId.wire,
    content_class: z.enum(['primary', 'attachment']),
    digest: Sha256Digest.wire,
  }),
  decode: (w) => ok(w),
}).with({
  toWireShape: (p) => p,
  view: {
    namespace: (p) => p.namespace_id,
    contentClass: (p) => p.content_class,
    digest: (p) => p.digest,
  },
});
export type ContentAddress = ValueOf<typeof ContentAddress>;
export interface PrepareInput {
  rows: { id: string; content: ContentAddress }[];
  content: ContentAddress[];
}
export type WriteRows = { id: string; content: ContentAddress }[];
export const copyWriteRows = (rows: WriteRows): WriteRows =>
  rows.map((row) => ({ ...row }));
// Kept module-private in application code; exported here for the package's law tests.
export const PreparedWrite = defineDerived({
  kind: 'example/prepared-write',
  derive: (input: PrepareInput) => {
    if (!input || !Array.isArray(input.rows) || !Array.isArray(input.content))
      return err({
        kind: 'example/prepared-write',
        reason: 'invalid_input' as const,
        issues: ['rows and content arrays required'],
      });
    return ok({ rows: copyWriteRows(input.rows), contentToRetain: [...input.content] });
  },
}).with({
  view: {
    rows: (p) => copyWriteRows(p.rows) as Readonly<WriteRows>,
    contentToRetain: (p) => [...p.contentToRetain] as readonly ContentAddress[],
  },
});
export const prepareWrite = PreparedWrite.derive;
