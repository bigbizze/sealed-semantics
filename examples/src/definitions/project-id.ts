import { z } from 'zod';
import { defineSeal, type ValueOf } from 'sealed-semantics';

/** A project identifier, distinct from a user identifier. */
export const ProjectId = defineSeal({
  key: (parts) => parts,
  name: 'sealed-semantics-test/project-id',
  schema: z.string().regex(/^prj_[a-f0-9]{16,}$/),
})
  .view({
    suffix: (parts) => parts.slice(-6),
  })
  .docs({
    description: 'A project identifier.',
    examples: [
      {
        input: 'prj_fedcba9876543210',
        encoded: 'prj_fedcba9876543210',
      },
    ],
    view: { suffix: { description: 'The final six characters.', example: '543210' } },
  })
  .seal();

export type ProjectId = ValueOf<typeof ProjectId>;
