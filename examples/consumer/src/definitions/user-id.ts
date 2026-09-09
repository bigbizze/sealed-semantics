import { z } from 'zod';
import { defineKind, type ValueOf } from 'sealed-semantics';

export const UserId = defineKind({
  kind: 'sealed-semantics-test/user-id',
  schema: z.string().regex(/^(usr_[a-f0-9]{16,}|user:[0-9a-f-]{36})$/),
  decode: (wire) => {
    const spelling = wire.startsWith('user:')
      ? `usr_${wire.slice(5).replaceAll('-', '')}`
      : wire;
    return /^usr_[a-f0-9]{16,}$/.test(spelling)
      ? { ok: true, value: { spelling } }
      : {
          ok: false,
          error: {
            kind: 'sealed-semantics-test/user-id',
            reason: 'invalid_parts',
            issues: ['Invalid legacy identifier'],
          },
        };
  },
  encode: (parts) => parts.spelling,
  canonical: (parts) => ({ type: 'utf8' as const, value: parts.spelling }),
})
  .view({
    suffix: (parts) => parts.spelling.slice(-6),
  })
  .docs({
    description: 'A normalized user identifier.',
    examples: [
      {
        input: 'usr_0123456789abcdef',
        encoded: 'usr_0123456789abcdef',
        canonical: { type: 'utf8', value: 'usr_0123456789abcdef' },
      },
      {
        input: 'user:01234567-89ab-cdef-0123-456789abcdef',
        encoded: 'usr_0123456789abcdef0123456789abcdef',
        canonical: { type: 'utf8', value: 'usr_0123456789abcdef0123456789abcdef' },
      },
    ],
    view: { suffix: { description: 'The final six characters.', example: 'abcdef' } },
  })
  .seal();

export type UserId = ValueOf<typeof UserId>;
