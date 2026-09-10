import { createProfileLookup } from './define-value/profile-cache.ts';
import { MembershipBatch } from './define-minted/membership-workflow/membership-batch.ts';
import {
  addProjectMembers,
  saveMembershipBatch,
} from './define-minted/membership-workflow/membership-workflow.ts';
import {
  section,
  sectionDescription,
  runHttpRequestExample,
  compareParsingExamples,
  runInvalidInputExample,
  runProfileCacheExample,
  runMintedBatchExample,
  runRejectedBatchExample,
  runAddMembersExample,
} from '../runners.ts';
import { ProjectId, UserId, PreparedMembership } from '../definitions/index.ts';
import { z } from 'zod';

// ############################################################
section('1. HTTP request: JSON strings become sealed IDs');
sectionDescription(
  `You can decode individual properties yourself with UserId.codec.parse and ProjectId.codec.parse.

The suggested API for this is to just use zod schema parse though.
For e.g. with a complete request or response, a Zod schema is more convenient: declare each
field with its kind's codec, then decode the whole object in one call.
Zod validates the object structure and produces the correctly typed sealed IDs,
including values inside nested objects and arrays, without manual field mapping.

This gives you another reason to use Zod wherever data enters or leaves the
application: validating the boundary also handles conversion to sealed values,
and encoding the same schema converts them back to wire data. The safer path
also requires less repetitive code. Both approaches below produce equal IDs.`,
);
const { responseBody, next: httpRequestNext } = await runHttpRequestExample();

export const postResponseSchema = z.object({
  user_id: UserId.codec,
  project_id: ProjectId.codec,
});
export type PostResponse = z.infer<typeof postResponseSchema>;

const decoded = z.safeDecode(postResponseSchema, responseBody);
if (!decoded.success) throw decoded.error;
const zodParseExample = decoded.data;

const manualParseExample: PostResponse = {
  ...responseBody,
  user_id: UserId.codec.parse(responseBody.user_id),
  project_id: ProjectId.codec.parse(responseBody.project_id),
};

httpRequestNext({ manualParseExample, zodParseExample });

// ############################################################
section('2. Two parsing paths: different objects, equal IDs');
compareParsingExamples({
  sameUserObject: zodParseExample.user_id === manualParseExample.user_id,
  equalUsers: zodParseExample.user_id.equals(manualParseExample.user_id),
  sameProjectObject: zodParseExample.project_id === manualParseExample.project_id,
  equalProjects: zodParseExample.project_id.equals(manualParseExample.project_id),
  encoded: z.encode(postResponseSchema, zodParseExample),
  userPassesProjectCheck: ProjectId.is(zodParseExample.user_id),
});

// ############################################################
section('3. Invalid input: an HTTP error, a result, or an exception');
const invalidDemo = await runInvalidInputExample();
console.log(
  'UserId.codec.safeParse returns:',
  UserId.codec.safeParse(invalidDemo.invalidUser),
);
try {
  UserId.codec.parse(invalidDemo.invalidUser);
} catch (error) {
  invalidDemo.next(error);
}

// ############################################################
section('4. Profile cache: aliases share a database lookup');
const cacheDemo = runProfileCacheExample();
const findProfile = createProfileLookup(cacheDemo.loadFromDatabase);
for (const spelling of cacheDemo.spellings) {
  console.log('\nLookup input:', spelling);
  const user = UserId.codec.parse(spelling);
  const profile = await findProfile(user);
  cacheDemo.next(user, profile);
}
cacheDemo.finish();

// ############################################################
section('5. Minted batch: validate once before saving');
sectionDescription(
  `First, PreparedMembership combines a sealed UserId and a sealed ProjectId into
one membership plan. Both are required. Creating a plan requires calling
PreparedMembership.mint, which checks the inputs before creating the sealed value.
A function that accepts PreparedMembership can therefore rely on those checks
having run; an ordinary object with matching properties is not enough.

Next, MembershipBatch.mint takes several of these plans. Each plan has already
passed PreparedMembership.mint. The batch producer then checks that the list is
non-empty and that every plan refers to the same project, and keeps one plan per user.
The resulting batch records the outcome of both steps: validation of each plan,
followed by validation and preparation of the collection.

We will pass that batch to saveMembershipBatch, whose input type is MembershipBatch.
The function can rely on the producer's checks without repeating them. A TypeScript
object type alone would describe the properties but would not establish that these
checks ran. The sealed type requires construction through mint; the runtime brand
check also rejects callers that bypass TypeScript.`,
);
const membershipDemo = runMintedBatchExample();
const plans = membershipDemo.userIds.map((userId) => {
  const plan = PreparedMembership.mint({
    userId,
    projectId: membershipDemo.projectId,
  });
  if (!plan.ok) throw new Error(plan.error.issues.join(' '));
  return plan.value;
});
const minted = MembershipBatch.mint(plans);
if (!minted.ok) throw new Error(minted.error.issues.join(' '));
const batch = minted.value;
const saved = await saveMembershipBatch(batch, membershipDemo.database);
membershipDemo.next(batch, plans, saved);

// ############################################################
section('6. Rejected batches never reach the database');
const rejectionDemo = runRejectedBatchExample(membershipDemo);
const otherPlan = PreparedMembership.mint({
  userId: rejectionDemo.otherUserId,
  projectId: rejectionDemo.otherProjectId,
});
if (!otherPlan.ok) throw new Error(otherPlan.error.issues.join(' '));
const mixed = MembershipBatch.mint([...batch.view.plans, otherPlan.value]);
const empty = await addProjectMembers(
  rejectionDemo.emptyRequest,
  membershipDemo.database,
);
const invalid = await addProjectMembers(
  rejectionDemo.invalidRequest,
  membershipDemo.database,
);
rejectionDemo.next(mixed, empty, invalid);

// ############################################################
section('7. Complete add-members request');
const addMembersDemo = runAddMembersExample();
const added = await addProjectMembers(
  addMembersDemo.requestBody,
  membershipDemo.database,
);
addMembersDemo.next(added);

console.log('\nDemo complete. All comparisons and operation checks passed.\n');
