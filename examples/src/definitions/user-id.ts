import { z } from 'zod';
import { defineKind, type ValueOf } from 'sealed-semantics';

export const UserId = defineKind({
  key: (parts) => parts,
  kind: 'sealed-semantics-test/user-id',
  schema: z.codec(
    z.string().regex(/^(usr_[a-f0-9]{16,}|user:[0-9a-f-]{36})$/),
    z.string().regex(/^usr_[a-f0-9]{16,}$/),
    {
      decode: (spelling) =>
        spelling.startsWith('user:')
          ? `usr_${spelling.slice(5).replaceAll('-', '')}`
          : spelling,
      encode: (spelling) => spelling,
    },
  ),
})
  .view({
    suffix: (parts) => parts.slice(-6),
  })
  .docs({
    description: 'A normalized user identifier.',
    examples: [
      {
        input: 'usr_0123456789abcdef',
        encoded: 'usr_0123456789abcdef',
      },
      {
        input: 'user:01234567-89ab-cdef-0123-456789abcdef',
        encoded: 'usr_0123456789abcdef0123456789abcdef',
      },
    ],
    view: { suffix: { description: 'The final six characters.', example: 'abcdef' } },
  })
  .seal();

export type UserId = ValueOf<typeof UserId>;
