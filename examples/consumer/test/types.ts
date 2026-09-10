import { z } from 'zod';
// Executable examples. Each @ts-expect-error also verifies a compiler error.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UserId } from '../src/definitions/user-id.ts';
import { ProjectId } from '../src/definitions/project-id.ts';
import { PreparedMembership } from '../src/definitions/prepared-membership.ts';

function identifiers() {
  const user = UserId.codec.safeParse('usr_0123456789abcdef');
  const project = ProjectId.codec.safeParse('prj_fedcba9876543210');
  assert.ok(user.success);
  assert.ok(project.success);
  return { userId: user.data, projectId: project.data };
}

function assertInvalid(result: ReturnType<typeof PreparedMembership.mint>) {
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.error.reason, 'invalid_input');
  assert.deepEqual(result.error.issues, [
    'Expected a sealed UserId and a sealed ProjectId.',
  ]);
}

test('mint accepts both sealed identifiers and preserves their types and identities', () => {
  const { userId, projectId } = identifiers();
  const result = PreparedMembership.mint({ userId, projectId });
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

test('minted values have no encode method', () => {
  const result = PreparedMembership.mint(identifiers());
  assert.ok(result.ok);
  assert.equal('encode' in result.value, false);
  assert.throws(() => {
    // @ts-expect-error Minted values have no external representation.
    result.value.encode();
  }, TypeError);
});

test('mint rejects a missing project identifier', () => {
  const { userId } = identifiers();
  // @ts-expect-error Both identifiers are required.
  const result = PreparedMembership.mint({ userId });
  assertInvalid(result);
});

test('mint rejects a missing user identifier', () => {
  const { projectId } = identifiers();
  // @ts-expect-error Both identifiers are required.
  const result = PreparedMembership.mint({ projectId });
  assertInvalid(result);
});

test('mint rejects swapped identifier kinds', () => {
  const { userId, projectId } = identifiers();
  // @ts-expect-error User and project identifiers are not interchangeable.
  const result = PreparedMembership.mint({ userId: projectId, projectId: userId });
  assertInvalid(result);
});

test('mint rejects raw wire strings', () => {
  const { userId, projectId } = identifiers();
  const result = PreparedMembership.mint({
    // @ts-expect-error The producer expects a sealed UserId.
    userId: z.encode(UserId.codec, userId),
    // @ts-expect-error The producer expects a sealed ProjectId.
    projectId: z.encode(ProjectId.codec, projectId),
  });
  assertInvalid(result);
});

test('mint rejects kind definitions instead of sealed instances', () => {
  // @ts-expect-error Definitions are not sealed instances.
  const result = PreparedMembership.mint({ userId: UserId, projectId: ProjectId });
  assertInvalid(result);
});
