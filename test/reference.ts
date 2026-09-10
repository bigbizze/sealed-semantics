const succeed = <T>(value: T) => ({ ok: true as const, value });
const fail = <E>(error: E) => ({ ok: false as const, error });
import { z } from 'zod';
import { defineSeal, defineMint, type ValueOf } from '../src/index.js';
export const normalizeUserSpelling = (w: string) =>
  w.startsWith('user:') ? `usr_${w.slice(5).replaceAll('-', '')}` : w;
export const UserId = defineSeal({
  name: 'example/user-id',
  schema: z.codec(
    z.string().regex(/^(usr_[a-f0-9]{16,}|user:[0-9a-f-]{36})$/),
    z.object({ spelling: z.string().regex(/^usr_[a-f0-9]{16,}$/) }),
    {
      decode: (w) => ({ spelling: normalizeUserSpelling(w) }),
      encode: (p) => p.spelling,
    },
  ),
  key: (p) => p.spelling,
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
export const Sha256Digest = defineSeal({
  key: (parts) => parts,
  name: 'example/sha256',
  schema: z.codec(
    z.string().regex(/^[a-f0-9]{64}$/),
    z.string().regex(/^[a-f0-9]{64}$/),
    {
      decode: (hex) => hex,
      encode: (p) => p,
    },
  ),
})
  .view({ hex: (p) => p })
  .docs({
    view: { hex: { description: 'Hexadecimal digest.' } },
    examples: [
      {
        input: 'ab'.repeat(32),
        encoded: 'ab'.repeat(32),
      },
    ],
  })
  .seal();
export const NamespaceId = defineSeal({
  key: (parts) => parts,
  name: 'example/namespace-id',
  schema: z.string().regex(/^ns:[a-z]+$/),
})
  .view({ name: (p) => p })
  .docs({
    examples: [{ input: 'ns:example', encoded: 'ns:example' }],
    view: { name: { description: 'Namespace name.' } },
  })
  .seal();
export const ContentAddress = defineSeal({
  name: 'example/content-address',
  key: (p) => `${p.namespace_id.view.name}:${p.content_class}:${p.digest.view.hex}`,
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
export const PreparedWrite = defineMint({
  name: 'example/prepared-write',
  mint: (input: PrepareInput) => {
    if (!input || !Array.isArray(input.rows) || !Array.isArray(input.content))
      return fail({
        name: 'example/prepared-write',
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
    rows: (p) => p.rows,
    contentToRetain: (p) => p.contentToRetain,
  })
  .docs({
    view: {
      rows: { description: 'Immutable rows to write.' },
      contentToRetain: { description: 'Sealed content addresses to retain.' },
    },
  })
  .seal();
export const prepareWrite = PreparedWrite.mint;
