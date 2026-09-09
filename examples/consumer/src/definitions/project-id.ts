import { z } from 'zod';
import { defineValue, type ValueOf } from 'sealed-semantics';

/** A project identifier, distinct from a user identifier. */
export const ProjectId = defineValue({
  kind: 'sealed-semantics-test/project-id',
  wire: z.string().regex(/^prj_[a-f0-9]{16,}$/),
  decode: (spelling) => ({ ok: true, value: { spelling } }),
})
  .with({
    toWireShape: (parts) => parts.spelling,
    canonical: (parts) => ({ type: 'utf8' as const, value: parts.spelling }),
    view: {
      suffix: (parts) => parts.spelling.slice(-6),
    },
  })
  .docs({
    description: 'A project identifier.',
    examples: [
      {
        input: 'prj_fedcba9876543210',
        encoded: 'prj_fedcba9876543210',
        canonical: { type: 'utf8', value: 'prj_fedcba9876543210' },
      },
    ],
    view: { suffix: { description: 'The final six characters.', example: '543210' } },
  });

export type ProjectId = ValueOf<typeof ProjectId>;
