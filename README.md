# sealed-semantics

Validate external data into specific types. Require checked values at application functions instead of accepting any object with matching properties.

`defineValue` creates semantic values such as `UserId` and `ProjectId`. `defineDerived` creates values that can only be obtained after their producer accepts the input. The producer supplies the rules; the library keeps the accepted state private.

The package is in initial development; the API may change before 1.0.

Requires Node 22+, TypeScript 5.7+, and Zod >=4.1 <5.

```sh
npm install sealed-semantics zod
```

## Validate IDs at the boundary

```ts
import { z } from 'zod';
import { defineValue, defineDerived, type ValueOf } from 'sealed-semantics';

const UserId = defineValue({
  kind: 'readme/user-id',
  wire: z.string().regex(/^usr_[a-f0-9]{16,}$/i),
  decode: spelling => ({ ok: true, value: spelling.toLowerCase() }),
}).with({
  toWireShape: spelling => spelling,
  view: { suffix: spelling => spelling.slice(-6) },
});
type UserId = ValueOf<typeof UserId>;

const ProjectId = defineValue({
  kind: 'readme/project-id',
  wire: z.string().regex(/^prj_[a-f0-9]{16,}$/),
  decode: spelling => ({ ok: true, value: spelling }),
}).with({ toWireShape: spelling => spelling });
type ProjectId = ValueOf<typeof ProjectId>;

const MembershipResponse = z.object({
  user_id: UserId.wire,
  project_id: ProjectId.wire,
});
const member = MembershipResponse.parse({
  user_id: 'USR_0123456789ABCDEF',
  project_id: 'prj_fedcba9876543210',
});
// member.user_id is a UserId; member.project_id is a ProjectId.
const wireResponse = z.encode(MembershipResponse, member);
// { user_id: 'usr_0123456789abcdef', project_id: 'prj_fedcba9876543210' }

const user = UserId.parseOrThrow('usr_0123456789abcdef');
const profiles = UserId.map<string>();
profiles.set(member.user_id, 'Alice');
console.log(profiles.get(user)); // Alice: equal IDs share an entry.
```

You can parse individual fields with `parseOrThrow()`. A Zod schema handles an entire request or response, including nested values, without manual field mapping. Validation also produces the sealed types; encoding the same schema produces raw JSON data.

Use `parse()` when you want a success/failure result. `parseOrThrow()` returns the value directly or throws a `TypeError` with the original `ValueError` as `cause`. See [producer results](docs/producer-results.md).

## Require a checked input before saving

A matching object shape does not establish that validation ran. A derived type lets a function require the result of a particular producer:

```ts
const MembershipBatch = defineDerived({
  kind: 'readme/membership-batch',
  derive: (input: { projectId: ProjectId; userIds: readonly UserId[] }) => {
    if (!ProjectId.is(input?.projectId) || !Array.isArray(input?.userIds as unknown)
      || input.userIds.length === 0
      || !Array.from(input.userIds).every(id => UserId.is(id))) {
      return { ok: false, error: {
        kind: 'readme/membership-batch', reason: 'invalid_input',
        issues: ['Expected a sealed project and at least one sealed user.'],
      } };
    }
    const users = UserId.set();
    for (const id of input.userIds) users.add(id);
    return { ok: true, value: { projectId: input.projectId, userIds: [...users] } };
  },
}).with({ view: {
  projectId: parts => parts.projectId,
  userIds: parts => [...parts.userIds],
} });
type MembershipBatch = ValueOf<typeof MembershipBatch>;

function saveMembershipBatch(
  batch: MembershipBatch,
  write: (project: string, users: string[]) => void,
) {
  if (!MembershipBatch.is(batch)) throw new TypeError('Expected a MembershipBatch');
  write(batch.view.projectId.encode(), batch.view.userIds.map(id => id.encode()));
}

const batch = MembershipBatch.derive({ projectId: member.project_id, userIds: [user] });
if (batch.ok) saveMembershipBatch(batch.value, (project, users) => {
  console.log('Database write:', { project, users });
});
```

The producer checks the IDs, rejects empty selections, removes duplicate users, and stores a new array. The save function can rely on those steps having run. TypeScript rejects an ordinary matching object; `MembershipBatch.is` also rejects callers that bypass TypeScript. The producer must implement the promised checks and avoid mutable aliases. The library does not establish authorization or database state.

The [full membership workflow](examples/consumer/src/examples/define-derived/membership-workflow/membership-workflow.ts) first derives individual `PreparedMembership` plans from both ID types, then derives a batch that checks all plans belong to one project.

## Run the application examples

```sh
npm ci
npm run test:consumer
npm run examples --prefix examples/consumer
```

Start with the [example index](examples/consumer/src/examples/index.ts). It shows the important API calls beside section descriptions. [Runners](examples/consumer/src/runners.ts) provide fixtures and detailed logging. The fake HTTP server and database adapters do not perform external writes.

## API rules and further reading

- `defineValue(...).with(...)` and `defineDerived(...).with(...)` complete definitions. Optional `.docs(...)` validates executable examples immediately.
- `value.view.name` reads a declared projection. `value.canonical()` exists only when configured. Derived values have no encoding or canonical representation.
- Semantic `.equals()` compares represented values; `===` compares object identity. Derived equality uses identity. Kind maps and sets follow these rules.
- Kinds, instances, prototypes, and view facades are frozen. Private state is not generically frozen; producers must own it and return copies of mutable projections.
- Names are unique among completed definitions in one JavaScript realm, including across installed package copies. Unimported source files are not checked.
- The package exports `sealed-semantics` and `sealed-semantics/laws`. There is no CLI or public Result helper API. Install the optional `fast-check` peer for law tests.

Read [guarantees](docs/guarantees.md), [documentation metadata](docs/documentation.md), [diagnostics](docs/diagnostics.md), and [law testing](docs/laws.md). For development, run `npm run check`; see [release checks](docs/releasing.md) for package and version-matrix validation. [Revision 5](docs/specification.md) is historical; [amendments](docs/amendments.md) record its changes.

Contributions: [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md). Licensed under [MIT](LICENSE).
