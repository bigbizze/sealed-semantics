import { z } from 'zod';
import { UserId, ProjectId, PreparedMembership } from '../../../definitions/index.ts';
import { MembershipBatch } from './membership-batch.ts';

// Supply a database implementation in the application. The runnable demo prints the write.
export interface MembershipDatabase {
  insertMembers(projectId: string, userIds: readonly string[]): Promise<void>;
}

// This function requires a checked batch. An object with matching properties is not enough.
export async function saveMembershipBatch(
  batch: MembershipBatch,
  database: MembershipDatabase,
) {
  if (!MembershipBatch.is(batch))
    throw new TypeError('Expected a validated MembershipBatch');

  // One project and one entry per user are already established by derive.
  // Convert to database strings only when writing.
  await database.insertMembers(
    batch.view.projectId.encode(),
    batch.view.plans.map((plan) => plan.view.userId.encode()),
  );
  return { added: batch.view.count };
}

const AddMembersRequest = z.object({
  project_id: ProjectId.wire,
  user_ids: z.array(UserId.wire),
});

// Example application handler. The surrounding route handles authorization.
export async function addProjectMembers(body: unknown, database: MembershipDatabase) {
  const request = AddMembersRequest.safeParse(body);
  if (!request.success) {
    return { status: 400, body: { error: 'Invalid project or user identifier.' } };
  }

  const plans: PreparedMembership[] = [];
  for (const userId of request.data.user_ids) {
    const plan = PreparedMembership.derive({
      userId,
      projectId: request.data.project_id,
    });
    if (!plan.ok) return { status: 400, body: { error: plan.error.issues.join(' ') } };
    plans.push(plan.value);
  }

  const batch = MembershipBatch.derive(plans);
  if (!batch.ok) return { status: 400, body: { error: batch.error.issues.join(' ') } };

  const result = await saveMembershipBatch(batch.value, database);
  return { status: 200, body: result };
}
