import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { ProjectId, UserId } from '../definitions/index.ts';

const MembershipRequest = z.object({
  user_id: UserId.codec,
  project_id: ProjectId.codec,
});

// An HTTP handler accepts unknown JSON. After this check, its IDs have specific types.
export function readMembershipRequest(body: unknown) {
  return MembershipRequest.safeParse(body);
}

// Encode the whole response at once, including any nested sealed values.
export function membershipResponse(userId: UserId, projectId: ProjectId) {
  return z.encode(MembershipRequest, { user_id: userId, project_id: projectId });
}

// An in-memory server: call fetch with a Request to receive a Response.
// It does not open a port or send network traffic.
export const fakeServer = {
  async POST(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== '/memberships/preview') {
      return Response.json({ error: 'Route not found.' }, { status: 404 });
    }
    if (request.method !== 'POST') {
      return Response.json(
        { error: 'Use POST to preview a membership.' },
        { status: 405, headers: { Allow: 'POST' } },
      );
    }

    // 1. Read the client's JSON. At this point it is untrusted data.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: 'The request body must be valid JSON.' },
        { status: 400 },
      );
    }

    // 2. Validate and decode the strings into sealed UserId and ProjectId values.
    const parsed = readMembershipRequest(body);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid user or project identifier.' },
        { status: 400 },
      );
    }

    // 3. Pass the specific ID types to application code.
    const preview = previewMembership(parsed.data.user_id, parsed.data.project_id);

    // 4. Encode the sealed IDs before serializing the response to JSON.
    return Response.json(membershipResponse(preview.userId, preview.projectId));
  },
};

// Application code accepts sealed IDs, rather than repeatedly checking strings.
// This endpoint previews the association; it does not save it or grant access.
function previewMembership(userId: UserId, projectId: ProjectId) {
  return { userId, projectId };
}

// Run directly; importing the application functions in tests does not run the demo.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // ############################################################
  console.log(
    '\n\u001b[1m========== HTTP request: JSON strings become sealed IDs ==========\u001b[22m\n',
  );
  console.log(
    '\u001b[3mYou can decode individual properties with their kind codecs. For a complete request or response, a Zod schema is usually more convenient: it validates the structure and decodes all nested values in one call. Encoding the same schema converts them back to external data.\u001b[23m\n',
  );

  const requestBody = {
    user_id: 'user:01234567-89ab-cdef-0123-456789abcdef',
    project_id: 'prj_fedcba9876543210',
  };
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
  console.log('Raw response:', responseBody);
  assert.equal(response.status, 200);

  const parsed = MembershipRequest.parse(responseBody);
  const manuallyParsed = {
    user_id: UserId.codec.parse(responseBody.user_id),
    project_id: ProjectId.codec.parse(responseBody.project_id),
  };
  console.log('\nDecoded response:', parsed);
  console.log('User suffix:', parsed.user_id.view.suffix);
  console.log('Project suffix:', parsed.project_id.view.suffix);
  console.log('Same user object:', parsed.user_id === manuallyParsed.user_id);
  console.log('Same project object:', parsed.project_id === manuallyParsed.project_id);
  console.log('Encoded response:', z.encode(MembershipRequest, parsed));
  assert.equal(parsed.user_id, manuallyParsed.user_id);
  assert.equal(parsed.project_id, manuallyParsed.project_id);
  // ############################################################
  console.log(
    '\n\u001b[1m========== Invalid input: HTTP errors, results, and exceptions ==========\u001b[22m\n',
  );

  const invalidUser = 'not-a-user-id';
  const rejected = await fakeServer.POST(
    new Request('https://example.test/memberships/preview', {
      method: 'POST',
      body: JSON.stringify({ ...requestBody, user_id: invalidUser }),
    }),
  );
  console.log('HTTP status:', rejected.status);
  console.log('Error response:', await rejected.json());
  assert.equal(rejected.status, 400);
  console.log('\nsafeParse result:', UserId.codec.safeParse(invalidUser));
  try {
    UserId.codec.parse(invalidUser);
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    console.log('\nparse throws:', error.message);
  }
}
