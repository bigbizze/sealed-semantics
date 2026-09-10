import { defineMinted, type ValueOf } from 'sealed-semantics';
import { UserId, PreparedMembership } from '../../../definitions/index.ts';

// saveMembershipBatch accepts this type so every caller must first pass these checks:
// at least one plan, all for the same project, with only one plan per user.
// Store a new array. Its view is cached and deeply frozen.
export const MembershipBatch = defineMinted({
  kind: 'sealed-semantics-test/examples/membership-batch',
  mint: (plans: readonly PreparedMembership[]) => {
    if (
      // Check runtime input without narrowing the typed readonly array to any[].
      !Array.isArray(plans as unknown) ||
      plans.length === 0 ||
      !Array.from(plans).every((plan) => PreparedMembership.is(plan))
    ) {
      return {
        ok: false,
        error: {
          kind: 'sealed-semantics-test/examples/membership-batch',
          reason: 'invalid_input',
          issues: ['Expected a non-empty array of membership plans.'],
        },
      };
    }
    const projectId = plans[0]!.view.projectId;
    if (plans.some((plan) => projectId !== plan.view.projectId)) {
      return {
        ok: false,
        error: {
          kind: 'sealed-semantics-test/examples/membership-batch',
          reason: 'invalid_input',
          issues: ['All plans must belong to the same project.'],
        },
      };
    }
    const users = new Set<UserId>();
    const unique = plans.filter((plan) => {
      if (users.has(plan.view.userId)) return false;
      users.add(plan.view.userId);
      return true;
    });
    return { ok: true, value: { projectId, plans: unique } };
  },
})
  .view({
    projectId: (parts) => parts.projectId,
    plans: (parts) => parts.plans,
    count: (parts) => parts.plans.length,
  })
  .docs({
    description:
      'A local batch of distinct users for one project; it does not grant access or reserve capacity.',
    view: {
      projectId: { description: 'The common project for every plan.' },
      plans: {
        description: 'An immutable array of plans, one per semantic user identifier.',
      },
      count: { description: 'The number of distinct users in the batch.' },
    },
  })
  .seal();
export type MembershipBatch = ValueOf<typeof MembershipBatch>;
