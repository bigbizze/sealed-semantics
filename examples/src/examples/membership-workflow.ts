import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { defineMinted, type ValueOf } from 'sealed-semantics';
import { UserId, ProjectId } from '../definitions/index.ts';
export interface MembershipInput {
  userId: UserId;
  projectId: ProjectId;
}

/** A local plan to associate a user with a project; it does not grant access. */
export const PreparedMembership = defineMinted({
  kind: 'sealed-semantics-test/prepared-membership',
  mint: (input: MembershipInput) => {
    // Also reject raw strings and wrong-kind objects from JavaScript callers.
    if (!UserId.is(input?.userId) || !ProjectId.is(input?.projectId)) {
      return {
        ok: false,
        error: {
          code: 'invalid_membership' as const,
          message: 'Expected a sealed UserId and a sealed ProjectId.',
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
          code: 'invalid_membership' as const,
          message: 'Expected a non-empty array of membership plans.',
        },
      };
    }
    const projectId = plans[0]!.view.projectId;
    if (plans.some((plan) => projectId !== plan.view.projectId)) {
      return {
        ok: false,
        error: {
          code: 'invalid_membership' as const,
          message: 'All plans must belong to the same project.',
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

// Supply a database implementation in the application. The runnable demo prints the write.
export interface MembershipDatabase {
  insertMembers(projectId: string, userIds: readonly string[]): Promise<void>;
}

// This function requires a checked batch. An object with matching properties is not enough.
export async function saveMembershipBatch(
  batch: MembershipBatch,
  database: MembershipDatabase,
) {
  // One project and one entry per user are already established by mint.
  // Convert to database strings only when writing.
  await database.insertMembers(
    z.encode(ProjectId.codec, batch.view.projectId),
    batch.view.plans.map((plan) => z.encode(UserId.codec, plan.view.userId)),
  );
  return { added: batch.view.count };
}

const AddMembersRequest = z.object({
  project_id: ProjectId.codec,
  user_ids: z.array(UserId.codec),
});

// Example application handler. The surrounding route handles authorization.
export async function addProjectMembers(body: unknown, database: MembershipDatabase) {
  const request = AddMembersRequest.safeParse(body);
  if (!request.success) {
    return { status: 400, body: { error: 'Invalid project or user identifier.' } };
  }

  const plans: PreparedMembership[] = [];
  for (const userId of request.data.user_ids) {
    const plan = PreparedMembership.mint({
      userId,
      projectId: request.data.project_id,
    });
    if (!plan.ok) return { status: 400, body: { error: plan.error.message } };
    plans.push(plan.value);
  }

  const batch = MembershipBatch.mint(plans);
  if (!batch.ok) return { status: 400, body: { error: batch.error.message } };

  const result = await saveMembershipBatch(batch.value, database);
  return { status: 200, body: result };
}

// Run directly; importing the application functions in tests does not run the demo.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // ############################################################
  console.log(
    '\n\u001b[1m========== Minted batch: validate once before saving ==========\u001b[22m\n',
  );
  console.log(
    "\u001b[3mFirst, PreparedMembership combines a sealed UserId and a sealed ProjectId into\none membership plan. Both are required. Creating a plan requires calling\nPreparedMembership.mint, which checks the inputs before creating the sealed value.\nA function that accepts PreparedMembership can therefore rely on those checks\nhaving run; an ordinary object with matching properties is not enough.\n\nNext, MembershipBatch.mint takes several of these plans. Each plan has already\npassed PreparedMembership.mint. The batch producer then checks that the list is\nnon-empty and that every plan refers to the same project, and keeps one plan per user.\nThe resulting batch records the outcome of both steps: validation of each plan,\nfollowed by validation and preparation of the collection.\n\nWe will pass that batch to saveMembershipBatch, whose input type is MembershipBatch.\nThe function can rely on the producer's checks without repeating them. A TypeScript\nobject type alone would describe the properties but would not establish that these\nchecks ran. The sealed type requires construction through mint. Runtime checks\nbelong at untyped boundaries, not in every function that receives this type.\u001b[23m\n",
  );

  const legacyUser = 'user:01234567-89ab-cdef-0123-456789abcdef';
  const currentUser = 'usr_0123456789abcdef0123456789abcdef';
  const secondUser = 'usr_abcdef0123456789';
  const project = 'prj_fedcba9876543210';
  const selectedSpellings = [legacyUser, currentUser, secondUser];
  console.log('Selected users:', selectedSpellings);
  let writes = 0;
  const database: MembershipDatabase = {
    async insertMembers(projectId, userIds) {
      writes++;
      console.log('\nDatabase write:', { projectId, userIds });
    },
  };
  const projectId = ProjectId.codec.parse(project);
  const plans = selectedSpellings.map((spelling) => {
    const plan = PreparedMembership.mint({
      userId: UserId.codec.parse(spelling),
      projectId,
    });
    if (!plan.ok) throw new Error(plan.error.message);
    return plan.value;
  });
  const minted = MembershipBatch.mint(plans);
  if (!minted.ok) throw new Error(minted.error.message);
  const batch = minted.value;
  const saved = await saveMembershipBatch(batch, database);
  console.log('\nPrepared plans:', plans.length);
  console.log('Accepted distinct users:', batch.view.count);
  console.log('Save result:', saved);
  console.log('Stable observation:', batch.view.plans === batch.view.plans);
  console.log('Immutable observation:', Object.isFrozen(batch.view.plans));
  assert.equal(batch.view.count, 2);
  // ############################################################
  console.log(
    '\n\u001b[1m========== Rejected batches never reach the database ==========\u001b[22m\n',
  );

  const writesBefore = writes;
  const otherPlan = PreparedMembership.mint({
    userId: UserId.codec.parse(secondUser),
    projectId: ProjectId.codec.parse('prj_0123456789abcdef'),
  });
  if (!otherPlan.ok) throw new Error(otherPlan.error.message);
  const mixed = MembershipBatch.mint([...batch.view.plans, otherPlan.value]);
  assert(!mixed.ok);
  console.log('Mixed projects:', mixed.error.message);
  for (const user_ids of [[], ['invalid']]) {
    const rejected = await addProjectMembers(
      { project_id: project, user_ids },
      database,
    );
    console.log('\nRejected request:', rejected);
    assert.equal(rejected.status, 400);
  }
  console.log('\nDatabase writes during rejected requests:', writes - writesBefore);
  assert.equal(writes, writesBefore);
  // ############################################################
  console.log(
    '\n\u001b[1m========== Complete add-members request ==========\u001b[22m\n',
  );

  const requestBody = { project_id: project, user_ids: selectedSpellings };
  console.log('Request body:', requestBody);
  const response = await addProjectMembers(requestBody, database);
  console.log('\nResponse:', response);
  assert.equal(response.status, 200);
}
