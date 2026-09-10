import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UserId } from '../src/definitions/user-id.ts';
import { ProjectId } from '../src/definitions/project-id.ts';
import { PreparedMembership } from '../src/definitions/prepared-membership.ts';
import { MembershipBatch } from '../src/examples/define-minted/membership-workflow/membership-batch.ts';
import {
  fakeServer,
  readMembershipRequest,
  membershipResponse,
} from '../src/examples/define-value/http-contract.ts';
import { createProfileLookup } from '../src/examples/define-value/profile-cache.ts';
import {
  addProjectMembers,
  saveMembershipBatch,
  type MembershipDatabase,
} from '../src/examples/define-minted/membership-workflow/membership-workflow.ts';

const legacy = 'user:01234567-89ab-cdef-0123-456789abcdef';
const current = 'usr_0123456789abcdef0123456789abcdef';
const projectWire = 'prj_fedcba9876543210';

function plan(userWire = current, project = projectWire) {
  const userId = UserId.codec.safeParse(userWire);
  const projectId = ProjectId.codec.safeParse(project);
  assert(userId.success && projectId.success);
  const result = PreparedMembership.mint({
    userId: userId.data,
    projectId: projectId.data,
  });
  assert(result.ok);
  return result.value;
}

function recordingDatabase() {
  const writes: { projectId: string; userIds: readonly string[] }[] = [];
  const database: MembershipDatabase = {
    async insertMembers(projectId, userIds) {
      writes.push({ projectId, userIds });
    },
  };
  return { database, writes };
}

test('HTTP input becomes sealed IDs and the response uses normalized strings', () => {
  const request = readMembershipRequest({ user_id: legacy, project_id: projectWire });
  assert(request.success);
  assert(UserId.is(request.data.user_id));
  assert(ProjectId.is(request.data.project_id));
  assert.deepEqual(membershipResponse(request.data.user_id, request.data.project_id), {
    user_id: current,
    project_id: projectWire,
  });
  assert.equal(
    readMembershipRequest({ user_id: projectWire, project_id: current }).success,
    false,
  );
});

test('legacy and current identifiers share a cached profile', async () => {
  let reads = 0;
  const lookup = createProfileLookup(async () => {
    reads++;
    return { displayName: 'Alice' };
  });
  const a = UserId.codec.safeParse(legacy);
  const b = UserId.codec.safeParse(current);
  assert(a.success && b.success);
  assert.notEqual(a.data, b.data);
  assert.equal((await lookup(a.data))?.displayName, 'Alice');
  assert.equal((await lookup(b.data))?.displayName, 'Alice');
  assert.equal(reads, 1);
});

test('adding members writes each normalized user once', async () => {
  const { database, writes } = recordingDatabase();
  assert.deepEqual(
    await addProjectMembers(
      { project_id: projectWire, user_ids: [legacy, current] },
      database,
    ),
    {
      status: 200,
      body: { added: 1 },
    },
  );
  assert.deepEqual(writes, [{ projectId: projectWire, userIds: [current] }]);
});

test('invalid identifiers and empty selections never reach the database', async () => {
  const { database, writes } = recordingDatabase();
  for (const user_ids of [[], ['invalid']]) {
    const response = await addProjectMembers(
      { project_id: projectWire, user_ids },
      database,
    );
    assert.equal(response.status, 400);
  }
  assert.equal(writes.length, 0);
});

test('batch validation rejects mixed projects and preserves its private list', () => {
  const first = plan(legacy);
  const duplicate = plan(current);
  const input = [first, duplicate];
  const batch = MembershipBatch.mint(input);
  assert(batch.ok);
  assert.equal(batch.value.view.count, 1);
  assert.equal(batch.value.view.plans[0], first);
  input.length = 0;
  batch.value.view.plans.pop();
  assert.equal(batch.value.view.plans.length, 1);
  assert.equal(MembershipBatch.mint(new Array<PreparedMembership>(1)).ok, false);
  const mixed = MembershipBatch.mint([first, plan(current, 'prj_0123456789abcdef')]);
  assert(!mixed.ok);
  assert.deepEqual(mixed.error.issues, ['All plans must belong to the same project.']);
});

test('saving requires a minted batch, not a matching object', async () => {
  const member = plan();
  const lookalike = {
    view: { projectId: member.view.projectId, plans: [member], count: 1 },
  };
  const { database, writes } = recordingDatabase();
  await assert.rejects(async () => {
    // @ts-expect-error Matching properties do not provide the MembershipBatch brand.
    await saveMembershipBatch(lookalike, database);
  }, /Expected a validated MembershipBatch/);
  assert.equal(writes.length, 0);
});

// Prevent a passing runtime test from hiding a loss of type inference.
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type BatchPlans = Expect<Equal<MembershipBatch['view']['plans'], PreparedMembership[]>>;
type BatchProject = Expect<Equal<MembershipBatch['view']['projectId'], ProjectId>>;

test('fake server decodes a request and returns normalized JSON', async () => {
  const response = await fakeServer.POST(
    new Request('https://example.test/memberships/preview', {
      method: 'POST',
      body: JSON.stringify({ user_id: legacy, project_id: projectWire }),
    }),
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type')!, /application\/json/);
  assert.deepEqual(await response.json(), {
    user_id: current,
    project_id: projectWire,
  });
});

test('fake server returns errors for malformed JSON, wrong IDs, and unknown routes', async () => {
  for (const body of [
    '{',
    JSON.stringify({ user_id: projectWire, project_id: current }),
  ]) {
    const response = await fakeServer.POST(
      new Request('https://example.test/memberships/preview', { method: 'POST', body }),
    );
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  const wrongMethod = await fakeServer.POST(
    new Request('https://example.test/memberships/preview'),
  );
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');
  const missing = await fakeServer.POST(new Request('https://example.test/missing'));
  assert.equal(missing.status, 404);
});
