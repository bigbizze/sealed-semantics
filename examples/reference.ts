const succeed = <T>(value: T) => ({ ok: true as const, value });
const fail = <E>(error: E) => ({ ok: false as const, error });
import { z } from 'zod';
import { defineKind, defineMinted, type ValueOf } from '../src/index.js';
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
export const UserId = defineKind({
  kind: 'example/user-id',
  schema: z.codec(
    z.string().regex(/^(usr_[a-f0-9]{16,}|user:[0-9a-f-]{36})$/),
    z.object({ spelling: z.string().regex(/^usr_[a-f0-9]{16,}$/) }),
    {
      decode: (w) => ({ spelling: normalizeUserSpelling(w) }),
      encode: (p) => p.spelling,
    },
  ),
  allocate: (gen: () => string) => `user:${gen()}`,
  debug: (p) => `user(…${p.spelling.slice(-6)})`,
})
  .docs({
    examples: [
      {
        input: 'user:550e8400-e29b-41d4-a716-446655440000',
        encoded: 'usr_550e8400e29b41d4a716446655440000',
      },
    ],
  })
  .seal();
export type UserId = ValueOf<typeof UserId>;
export const Sha256Digest = defineKind({
  kind: 'example/sha256',
  schema: z.codec(
    z.string().regex(/^[a-f0-9]{64}$/),
    z.object({ bytes: z.instanceof(Uint8Array) }),
    {
      decode: (hex) => ({ bytes: hexToBytes(hex) }),
      encode: (p) => bytesToHex(p.bytes),
    },
  ),
  equals: (a, b) => constantTimeEqual(a.bytes, b.bytes),
})
  .docs({
    examples: [
      {
        input: 'ab'.repeat(32),
        encoded: 'ab'.repeat(32),
      },
    ],
  })
  .seal();
export const NamespaceId = defineKind({
  kind: 'example/namespace-id',
  schema: z.string().regex(/^ns:[a-z]+$/),
})
  .docs({ examples: [{ input: 'ns:example', encoded: 'ns:example' }] })
  .seal();
export const ContentAddress = defineKind({
  kind: 'example/content-address',
  schema: z.object({
    namespace_id: NamespaceId.codec,
    content_class: z.enum(['primary', 'attachment']),
    digest: Sha256Digest.codec,
  }),
})
  .view({
    namespace: (p) => p.namespace_id,
    contentClass: (p) => p.content_class,
    digest: (p) => p.digest,
  })
  .docs({
    examples: [
      {
        input: {
          namespace_id: 'ns:example',
          content_class: 'primary',
          digest: 'ab'.repeat(32),
        },
        encoded: {
          namespace_id: 'ns:example',
          content_class: 'primary',
          digest: 'ab'.repeat(32),
        },
      },
    ],
    view: {
      namespace: { description: 'Owning namespace.' },
      contentClass: { description: 'Content classification.' },
      digest: { description: 'SHA-256 content digest.' },
    },
  })
  .seal();
export type ContentAddress = ValueOf<typeof ContentAddress>;
export interface PrepareInput {
  rows: { id: string; content: ContentAddress }[];
  content: ContentAddress[];
}
export type WriteRows = { id: string; content: ContentAddress }[];
export const copyWriteRows = (rows: WriteRows): WriteRows =>
  rows.map((row) => ({ ...row }));
// Kept module-private in application code; exported here for the package's law tests.
export const PreparedWrite = defineMinted({
  kind: 'example/prepared-write',
  mint: (input: PrepareInput) => {
    if (!input || !Array.isArray(input.rows) || !Array.isArray(input.content))
      return fail({
        kind: 'example/prepared-write',
        reason: 'invalid_input' as const,
        issues: ['rows and content arrays required'],
      });
    return succeed({
      rows: copyWriteRows(input.rows),
      contentToRetain: [...input.content],
    });
  },
})
  .view({
    rows: (p) => copyWriteRows(p.rows) as Readonly<WriteRows>,
    contentToRetain: (p) => [...p.contentToRetain] as readonly ContentAddress[],
  })
  .docs({
    view: {
      rows: { description: 'Detached rows to write.' },
      contentToRetain: { description: 'Sealed content addresses to retain.' },
    },
  })
  .seal();
export const prepareWrite = PreparedWrite.mint;
