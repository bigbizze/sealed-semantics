import { defineDerived, type ValueOf } from 'sealed-semantics';
import { UserId } from './user-id.ts';
import { ProjectId } from './project-id.ts';

export interface MembershipInput {
  userId: UserId;
  projectId: ProjectId;
}

/** A local plan to associate a user with a project; it does not grant access. */
export const PreparedMembership = defineDerived({
  kind: 'sealed-semantics-test/prepared-membership',
  derive: (input: MembershipInput) => {
    // Also reject raw strings and wrong-kind objects from JavaScript callers.
    if (!UserId.is(input?.userId) || !ProjectId.is(input?.projectId)) {
      return {
        ok: false,
        error: {
          kind: 'sealed-semantics-test/prepared-membership',
          reason: 'invalid_input',
          issues: ['Expected a sealed UserId and a sealed ProjectId.'],
        },
      };
    }
    // Copy the input container. The sealed children can be retained directly.
    return { ok: true, value: { userId: input.userId, projectId: input.projectId } };
  },
})
  .view({
    userId: (parts) => parts.userId,
    projectId: (parts) => parts.projectId,
  })
  .docs({
    description: 'A local membership plan that retains both sealed identifiers.',
    view: {
      userId: { description: 'The user in this plan.' },
      projectId: { description: 'The project in this plan.' },
    },
  })
  .seal();

export type PreparedMembership = ValueOf<typeof PreparedMembership>;
