import { z } from 'zod';
import { ProjectId, UserId } from '../../definitions/index.ts';

const MembershipRequest = z.object({
  user_id: UserId.wire,
  project_id: ProjectId.wire,
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
