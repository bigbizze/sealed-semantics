import { z } from 'zod';
import assert from 'node:assert/strict';
import { ProjectId, UserId, type PreparedMembership } from './definitions/index.ts';
import { fakeServer } from './examples/define-value/http-contract.ts';
import type { Profile } from './examples/define-value/profile-cache.ts';
import { MembershipBatch } from './examples/define-minted/membership-workflow/membership-batch.ts';
import type {
  MembershipDatabase,
  addProjectMembers,
  saveMembershipBatch,
} from './examples/define-minted/membership-workflow/membership-workflow.ts';

type ParsedResponse = { user_id: UserId; project_id: ProjectId };
const legacyUser = 'user:01234567-89ab-cdef-0123-456789abcdef';
const currentUser = 'usr_0123456789abcdef0123456789abcdef';
const secondUser = 'usr_abcdef0123456789';
const project = 'prj_fedcba9876543210';

export function section(title: string) {
  console.log(`\n\x1b[1m========== ${title} ==========\x1b[22m\n`);
}
export function sectionDescription(description: string) {
  console.log(`\x1b[3m${description}\x1b[23m\n`);
}

export async function runHttpRequestExample() {
  const requestBody = { user_id: legacyUser, project_id: project };
  console.log('POST /memberships/preview');
  console.log('Request body:', requestBody);
  const response = await fakeServer.POST(
    new Request('https://example.test/memberships/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }),
  );
  const responseBody = await response.json();
  console.log('\nHTTP status:', response.status);
  console.log('Raw response body:', responseBody);
  assert.equal(response.status, 200);
  return {
    responseBody,
    next({
      zodParseExample,
      manualParseExample,
    }: {
      zodParseExample: ParsedResponse;
      manualParseExample: ParsedResponse;
    }) {
      for (const [label, id] of [
        ['UserId', zodParseExample.user_id],
        ['ProjectId', zodParseExample.project_id],
      ] as const) {
        console.log(`\nDecoded ${label}`);
        console.log(
          '  Encoded:',
          UserId.is(id) ? z.encode(UserId.codec, id) : z.encode(ProjectId.codec, id),
        );
        console.log('  Display suffix:', id.view.suffix);
      }
      assert(
        UserId.is(zodParseExample.user_id) && UserId.is(manualParseExample.user_id),
      );
      assert(
        ProjectId.is(zodParseExample.project_id) &&
          ProjectId.is(manualParseExample.project_id),
      );
    },
  };
}

export function compareParsingExamples(results: {
  sameUserObject: boolean;
  equalUsers: boolean;
  sameProjectObject: boolean;
  equalProjects: boolean;
  encoded: unknown;
  userPassesProjectCheck: boolean;
}) {
  console.log('UserId: same object:', results.sameUserObject);
  console.log('UserId: equal value:', results.equalUsers);
  console.log('ProjectId: same object:', results.sameProjectObject);
  console.log('ProjectId: equal value:', results.equalProjects);
  console.log('\nEncode the complete response again:', results.encoded);
  console.log('A UserId passes ProjectId.is:', results.userPassesProjectCheck);
  assert(results.equalUsers, 'user_id not equal');
  assert(results.equalProjects, 'project_id not equal');
}

export async function runInvalidInputExample() {
  const invalidUser = 'not-a-user-id';
  const response = await fakeServer.POST(
    new Request('https://example.test/memberships/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: invalidUser, project_id: project }),
    }),
  );
  console.log('Invalid request status:', response.status);
  console.log('Invalid request body:', await response.json());
  assert.equal(response.status, 400);
  return {
    invalidUser,
    next(error: unknown) {
      if (!(error instanceof z.ZodError)) throw error;
      console.log('\nUserId.codec.parse throws:', error.message);
      console.log('Validation issues:', error.issues);
    },
  };
}

export function runProfileCacheExample() {
  let reads = 0;
  let previousReads = 0;
  const alice = UserId.codec.parse(currentUser);
  return {
    spellings: [legacyUser, currentUser, secondUser, secondUser],
    async loadFromDatabase(id: UserId): Promise<Profile> {
      reads++;
      console.log(
        '  Database read:',
        UserId.is(id) ? z.encode(UserId.codec, id) : z.encode(ProjectId.codec, id),
      );
      return { displayName: id.equals(alice) ? 'Alice' : 'Bob' };
    },
    next(user: UserId, profile: Profile | undefined) {
      console.log('  Source:', reads === previousReads ? 'cache' : 'database');
      console.log('  Profile:', profile?.displayName);
      console.log('  Display suffix:', user.view.suffix);
      previousReads = reads;
    },
    finish() {
      console.log('\nDatabase reads for four lookups:', reads);
      assert.equal(reads, 2);
    },
  };
}

export function runMintedBatchExample() {
  const selectedSpellings = [legacyUser, currentUser, secondUser];
  console.log('Selected users:', selectedSpellings);
  let writes = 0;
  const database: MembershipDatabase = {
    async insertMembers(projectId, userIds) {
      writes++;
      console.log('\nDatabase write:', { projectId, userIds });
    },
  };
  return {
    userIds: selectedSpellings.map((spelling) => UserId.codec.parse(spelling)),
    projectId: ProjectId.codec.parse(project),
    database,
    getWriteCount: () => writes,
    next(
      batch: MembershipBatch,
      plans: readonly PreparedMembership[],
      saved: Awaited<ReturnType<typeof saveMembershipBatch>>,
    ) {
      console.log('\nPrepared plans:', plans.length);
      console.log('Accepted distinct users:', batch.view.count);
      console.log('Batch project:', z.encode(ProjectId.codec, batch.view.projectId));
      console.log(
        'Batch users:',
        batch.view.plans.map((plan) => z.encode(UserId.codec, plan.view.userId)),
      );
      console.log('Correct batch brand:', MembershipBatch.is(batch));
      console.log(
        'An ordinary object passes the brand check:',
        MembershipBatch.is({ view: batch.view }),
      );
      console.log('Save result:', saved);
      const displayedPlans = batch.view.plans;
      displayedPlans.pop();
      console.log('\nRemove a row from a display copy');
      console.log('  Display rows remaining:', displayedPlans.length);
      console.log('  Batch users unchanged:', batch.view.count);
      assert.equal(batch.view.plans.length, 2);
    },
  };
}

export function runRejectedBatchExample(
  demo: ReturnType<typeof runMintedBatchExample>,
) {
  const writesBefore = demo.getWriteCount();
  return {
    otherUserId: UserId.codec.parse(secondUser),
    otherProjectId: ProjectId.codec.parse('prj_0123456789abcdef'),
    emptyRequest: { project_id: project, user_ids: [] },
    invalidRequest: { project_id: project, user_ids: ['invalid'] },
    next(
      mixed: ReturnType<typeof MembershipBatch.mint>,
      empty: Awaited<ReturnType<typeof addProjectMembers>>,
      invalid: Awaited<ReturnType<typeof addProjectMembers>>,
    ) {
      assert(!mixed.ok);
      console.log('Plans from two projects:', mixed.error.issues.join(' '));
      console.log('\nAdd-members request with an empty selection:', empty);
      console.log('Add-members request with an invalid user:', invalid);
      console.log(
        '\nDatabase writes during rejected requests:',
        demo.getWriteCount() - writesBefore,
      );
      assert.equal(empty.status, 400);
      assert.equal(invalid.status, 400);
      assert.equal(demo.getWriteCount(), writesBefore);
    },
  };
}

export function runAddMembersExample() {
  const requestBody = {
    project_id: project,
    user_ids: [legacyUser, currentUser, secondUser],
  };
  console.log('Request body:', requestBody);
  return {
    requestBody,
    next(response: Awaited<ReturnType<typeof addProjectMembers>>) {
      console.log('\nResponse:', response);
      assert.equal(response.status, 200);
    },
  };
}
