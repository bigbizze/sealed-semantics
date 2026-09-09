// Executable examples. Each @ts-expect-error also verifies a compiler error.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UserId } from '../src/definitions/user-id.ts';
import { ProjectId } from '../src/definitions/project-id.ts';
import { PreparedMembership } from '../src/definitions/prepared-membership.ts';

function identifiers() {
  const user = UserId.parse('usr_0123456789abcdef');
  const project = ProjectId.parse('prj_fedcba9876543210');
  assert.ok(user.ok);
  assert.ok(project.ok);
  return { userId: user.value, projectId: project.value };
}

function assertInvalid(result: ReturnType<typeof PreparedMembership.derive>) {
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.error.reason, 'invalid_input');
  assert.deepEqual(result.error.issues, [
    'Expected a sealed UserId and a sealed ProjectId.',
  ]);
}

test('derive accepts both sealed identifiers and preserves their types and identities', () => {
  const { userId, projectId } = identifiers();
  const result = PreparedMembership.derive({ userId, projectId });
  assert.ok(result.ok);
  const user: UserId = result.value.view.userId;
  const project: ProjectId = result.value.view.projectId;
  assert.equal(user, userId);
  assert.equal(project, projectId);
  assert.ok(UserId.is(user));
  assert.ok(ProjectId.is(project));
  // @ts-expect-error The projected identifier keeps its specific kind.
  const wrong: ProjectId = result.value.view.userId;
  assert.equal(ProjectId.is(wrong), false);
});

test('derived values have no encode method', () => {
  const result = PreparedMembership.derive(identifiers());
  assert.ok(result.ok);
  assert.equal('encode' in result.value, false);
  assert.throws(() => {
    // @ts-expect-error Derived values have no external representation.
    result.value.encode();
  }, TypeError);
});

test('derive rejects a missing project identifier', () => {
  const { userId } = identifiers();
  // @ts-expect-error Both identifiers are required.
  const result = PreparedMembership.derive({ userId });
  assertInvalid(result);
});

test('derive rejects a missing user identifier', () => {
  const { projectId } = identifiers();
  // @ts-expect-error Both identifiers are required.
  const result = PreparedMembership.derive({ projectId });
  assertInvalid(result);
});

test('derive rejects swapped identifier kinds', () => {
  const { userId, projectId } = identifiers();
  // @ts-expect-error User and project identifiers are not interchangeable.
  const result = PreparedMembership.derive({ userId: projectId, projectId: userId });
  assertInvalid(result);
});

test('derive rejects raw wire strings', () => {
  const { userId, projectId } = identifiers();
  const result = PreparedMembership.derive({
    // @ts-expect-error The producer expects a sealed UserId.
    userId: userId.encode(),
    // @ts-expect-error The producer expects a sealed ProjectId.
    projectId: projectId.encode(),
  });
  assertInvalid(result);
});

test('derive rejects kind definitions instead of sealed instances', () => {
  // @ts-expect-error Definitions are not sealed instances.
  const result = PreparedMembership.derive({ userId: UserId, projectId: ProjectId });
  assertInvalid(result);
});
