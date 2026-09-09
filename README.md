# sealed-semantics

## Who is this for?

Are you frustrated by Typescript types leaving escape hatches in the implementation of your architecture that give space for people or AI (especially AI!) to be lazy and ignore it where they see fit?

Are you done with typescript not being strict enough to prevent your type design from being circumvented, ignored in any local situation?

Are you tired of watching AI consistently not realizing that the local context it's looking at isn't sufficient for understanding how the type fits in the broader system, leading to constant slop code production, leaky abstractions, violated boundaries and other similar issues?

Does your codebase suffer from "there's already a similar helper for this in <_some other random module or place_>, use that" without any sign of eliminating this?

I am / was all of the above, so I made this package to hopefully eliminate much of that.

## The problem
Typescript's type system is great, but it has *a lot* of escape hatches, and tends to leave behind inexactness that you don't necessarily know is there. The various casting operations, the runtime hacks that ignore the transpiler, no enforced serialization protocol linked to types, and much more.

## The solution

**sealed-semantics** has just two primitives:

### `defineKind()`: Define what a value means and how it enters or leaves your application

You define "kinds". A  kind combines a TypeScript type with runtime rules for creating and using its values. 
Kinds are based on the semantic description of a datatype. For example: "This is a distance. It must be finite and non-negative. Inputs can use metres or kilometres, but internally it is always stored in metres. Callers can read the distance in either unit. When serialized, it always includes both the amount and the unit: { amount: 1500, unit: 'm' }."

You pass this definition to `defineKind()`, optionally add projections with `.view(...)`, and call `.seal()` to complete the kind. Every instance must be created through that kind’s construction methods or its codec, so it must pass the validation and decoding logic you defined.
The completed definition controls how instances can be used: their internal state stays private, `.view(...)` declares what callers may read, and encode defines how they are serialized. 
Callers cannot create a genuine instance simply by assembling an object with matching properties or casting it to the TypeScript type.

### `defineDerived()`: Require that specific logic has run before a value can be used

Sometimes valid individual values are not enough. You need to know that a particular set of rules has been applied to them together.

How often do you receive a `SomeInput`, then validate it again because its TypeScript type only tells you which properties it has?
Why can't the function require an input that has already passed those checks?

With `defineDerived()`, you put those rules in a derive function.
Its input can contain existing kinds, ordinary data, or both. After you complete the definition with .seal(), calling .derive(input) runs that function and creates an instance only if it succeeds.

A save function can then require a `SomeInput` instance. Callers must obtain one through a successful call to `SomeInput.derive(...)`.
They cannot substitute an ordinary object with the same properties.

You supply the checks. The library prevents callers from creating a genuine instance without passing through them.
 

---

### Requirements
Requires Node 22+, TypeScript 5.7+, and Zod >=4.1 <5. The package is in initial development; the API may change before 1.0.


Install with `npm install sealed-semantics`.
             `pnpm install sealed-semantics`
             `yarn add sealed-semantics`

---

## What does that look like in code?

Take a user ID. It arrives as a string in an HTTP response, but most of your application should not have to keep asking whether that string is actually a user ID of the kind you expect. In other words, this ID is user.id from the user table in my database, guaranteed. Not a customerId from Stripe, not any other kind of user ID, but just that it's provably a user.id from the user table in our database.

Define the rules once, then pass a `UserId` to functions that need one.

```ts
import { z } from 'zod';
import { defineValue, type ValueOf } from 'sealed-semantics';

const UserId = defineValue({
  kind: 'readme/user-id',
  wire: z.string().regex(/^usr_[a-f0-9]{16,}$/i),
  encode: spelling => spelling,
  decode: spelling => ({ ok: true, value: spelling.toLowerCase() }),
}).view({
  suffix: spelling => spelling.slice(-6)
}).seal();

type UserId = ValueOf<typeof UserId>;

const user = UserId.parseOrThrow('USR_0123456789ABCDEF');
console.log(user.encode());      // usr_0123456789abcdef
console.log(user.view.suffix);   // abcdef
```

`wire` is a zod schema defining the shape of the serialized data for a UserId. 

`decode` defines how data deserialized using the wire is converted into the internal private representation of this kind that you want (here, it normalizes the ID to lowercase). 

`encode` defines the encoding that transforms the internal representation into something that's used by consumers

`.view()` add custom methods that define how callers can use the encoded result to produce other data shapes.
`view.suffix` in this cases exposes just the final six characters of the userId.

`ValueOf<typeof UserId>` gives you the TypeScript type for instances produced by this kind definition. 
A function that accepts `UserId` cannot accidentally receive anything besides userIds of the defined kind. This means no ordinary string or a separately defined `ProjectId`, nor someone trying to bypass the function's signature as a workaround. If someone bypasses TypeScript with a cast, `UserId.is(value)` still checks whether the value is a real instance. A cast cannot create one.

## You can decode individual fields, or a whole response

The current API uses `schema` for the external format, `decode` and `encode` for conversion, and `.seal()` to finish a definition. `.view(...)` and `.docs(...)` are optional steps before `.seal()`.

Use `parseOrThrow()` to decode one value. It throws if the input is invalid. Use `parse()` instead when you want to handle an `{ ok: false, error }` result yourself.

For a request or response with several fields, a Zod schema saves you from manually decoding each one:

```ts
import { z } from 'zod';
import { defineKind, defineDerived, type ValueOf } from 'sealed-semantics';

const UserId = defineKind({
  kind: 'readme/user-id',
  schema: z.string().regex(/^usr_[a-f0-9]{16,}$/i),
  decode: (spelling) => ({ ok: true, value: spelling.toLowerCase() }),
  encode: (spelling) => spelling,
})
  .view({ suffix: (spelling) => spelling.slice(-6) })
  .seal();
type UserId = ValueOf<typeof UserId>;

const ProjectId = defineKind({
  kind: 'readme/project-id',
  schema: z.string().regex(/^prj_[a-f0-9]{16,}$/),
  decode: (spelling) => ({ ok: true, value: spelling }),
  encode: (spelling) => spelling,
}).seal();
type ProjectId = ValueOf<typeof ProjectId>;
const MembershipResponse = z.object({
  user_id: UserId.codec,
  project_id: ProjectId.codec,
});
const user = UserId.parseOrThrow('usr_0123456789abcdef');
const member = MembershipResponse.parse({
  user_id: 'USR_0123456789ABCDEF',
  project_id: 'prj_fedcba9876543210',
});
// member.user_id is now a UserId, and member.project_id is a ProjectId.
console.log(z.encode(MembershipResponse, member));
// { user_id: 'usr_0123456789abcdef', project_id: 'prj_fedcba9876543210' }
```

The same schema reads external data into your application types and writes those types back into external data. This works for nested objects and arrays too. Using Zod at these entry and exit points means less field-by-field conversion code.

## A function can also require that specific logic has already run

Suppose a database function saves a list of users to one project. It needs at least one user, and it should save each user only once. You could ask every caller to remember those rules. Or you could make the function accept a `MembershipBatch` that can only be created by running those rules.

That is what `defineDerived` is for. Its `.seal()` call finishes the definition; each later `.derive(input)` call runs the checks to create an instance. Here, it takes existing `ProjectId` and `UserId` instances and creates a new type:

```ts
const MembershipBatch = defineDerived({
  kind: 'readme/membership-batch',
  derive: (input: { projectId: ProjectId; userIds: readonly UserId[] }) => {
    const valid =
      ProjectId.is(input?.projectId) &&
      Array.isArray(input?.userIds as unknown) &&
      input.userIds.length > 0 &&
      Array.from(input.userIds).every((id) => UserId.is(id));
    if (!valid) {
      return {
        ok: false,
        error: {
          kind: 'readme/membership-batch',
          reason: 'invalid_input',
          issues: ['Expected a project ID and at least one user ID.'],
        },
      };
    }
    const users = UserId.set();
    for (const id of input.userIds) users.add(id);
    return { ok: true, value: { projectId: input.projectId, userIds: [...users] } };
  },
})
  .view({
    projectId: (parts) => parts.projectId,
    userIds: (parts) => [...parts.userIds],
  })
  .seal();
type MembershipBatch = ValueOf<typeof MembershipBatch>;

function saveMembershipBatch(batch: MembershipBatch) {
  if (!MembershipBatch.is(batch)) throw new TypeError('Expected a MembershipBatch');
  // Replace this log with your database write.
  console.log('Save members:', {
    project: batch.view.projectId.encode(),
    users: batch.view.userIds.map((id) => id.encode()),
  });
}

const batch = MembershipBatch.derive({
  projectId: member.project_id,
  userIds: [user],
});
if (batch.ok) saveMembershipBatch(batch.value);
```

`saveMembershipBatch` can rely on `derive` having run. An ordinary object with the same properties will not pass the type check or the runtime `MembershipBatch.is` check. The batch contains at least one user, and `UserId.set()` removes duplicates by ID value, even when they are different JavaScript objects.

The batch stores a new array, and `view.userIds` returns a new copy each time. Editing the caller's array or the returned array therefore cannot change the stored list. This copying is part of the definition above: the library keeps state private, but it does not automatically copy or freeze that state for you.

You still have to write the right checks in `derive`. This example checks the IDs and the list; it does not check whether the users exist or whether the caller may add them to the project. A derived value also has no `encode()` method. It records that local checks ran; when saving, you explicitly encode the IDs it contains.

## Try the full examples

From a clone of this repository:

```sh
npm ci
npm run test:consumer
npm run examples --prefix examples/consumer
```

Start with the [example index](examples/consumer/src/examples/index.ts). It walks through a fake HTTP request and response, ID comparisons, a cache keyed by user IDs, and saving project memberships. Each section shows the relevant calls and explains the result. [Runners](examples/consumer/src/runners.ts) contain the sample data and logging.

The [membership workflow](examples/consumer/src/examples/define-derived/membership-workflow/membership-workflow.ts) goes one step further than this README: it first derives a plan from a `UserId` and a `ProjectId`, then derives a batch from several plans. The batch checks that all plans belong to the same project. The save function therefore receives something that has passed both stages. The example uses a fake database; it does not write to an external service.

For more detail, read about [what the library guarantees](docs/guarantees.md), [parse errors](docs/producer-results.md), [adding checked examples with `.docs()`](docs/documentation.md), and [testing your definitions](docs/laws.md). The [diagnostics guide](docs/diagnostics.md) explains configuration errors. To contribute, see [CONTRIBUTING.md](CONTRIBUTING.md). For publishing checks, see [releasing](docs/releasing.md). Report security issues using [SECURITY.md](SECURITY.md). Licensed under [MIT](LICENSE).
