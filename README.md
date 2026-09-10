# sealed-semantics


This package is for the people who want to create software architecture using Typescript that is substantially more restrictive than what regular Typescript offers, for defining datatypes and how they are interacted with and move through the system.

Human engineers who are experienced in a codebase tend to carry around a lot of implicit context when working on a repository.
They implicitly just *know* how lots of things should be used and interact, or where the correct thing is for the current problem they're working on.
They tend to know that operations involving, for e.g., `UserClaims` objects should be performed in the way `UserClaims` tend to be in the application.

By contrast, AI tends to be mostly focused on the local context and its immediate vicinity when tasked to do something. It sometimes might notice that it's working with something called `UserClaims` 
and that this means that it should do a string search in the repo to find precedents for this. Whether it does such a search at all, or whether such a search finds the right things, leading to it making the right decision are the opposites of guarantees.
This is because we lack a good way to enforce them in Typescript.
An AI in such a situation could just as easily produce its own `UserClaims` thing that satisfies a shape, hand-rolling whatever local functions it needs to interact with this, satisfying what it needed to *locally* achieve for the local change.
This is often a tech debt production line!

The uncertainty that this produces leads to difficult code reviews by humans or, among other things,
the risk of leaving behind precedents for breaking the structural rules of your architecture.
(Where breaks in structure are then used as justifications for more breaks in the future by AI.)

You may not notice the mess this produces incrementally, because each individual set of changes seems locally coherent, but you definitely notice it once the repository is sufficiently complex! 

(You could replace AI in the last few paragraphs with humans, or more commonly, humans without as much experience in a codebase too.
AI coding just supercharges the amount of output that tends to work this way.)

As AI context windows increase or fill-up, their precision with choosing the right information in the context also decreases!

## Who is this for?

Are you frustrated by escape hatches in Typescript types giving room for downstream consumers violating contracts and boundaries?

Are you tired of watching AI consistently not realize that the local context it's looking at isn't sufficient for understanding how a given type fits in the broader system?

Does your codebase suffer from "there's already a similar helper for this in <_some other random module or place_>, use that", relying on the rote memory of human reviewers to catch this?

I am / was all of those things, so I made this package to hopefully eliminate much of it.

## The problem
Typescript's type system is great, but it has *a lot* of escape hatches, and tends to leave behind inexactness that you don't necessarily know is there.
From the various casting operations, to the runtime hacks that ignore the transpiler, to no enforced serialization protocol linked to types (and much more), types often feel more like hints than true constraints.

## The solution

### **sealed-semantics** has just two primitives:


### `defineKind()`: Define what a value means and how it enters or leaves your application

You define "kinds". A  kind combines a TypeScript type with runtime rules for creating and using its values. 
Kinds are based on the semantic description of a datatype. For example: "This is a distance. It must be finite and non-negative. Inputs can use metres or kilometres, but internally it is always stored in metres. Callers can read the distance in either unit. When serialized, it always includes both the amount and the unit: { amount: 1500, unit: 'm' }."

You pass this definition to `defineKind()`, optionally add projections with `.view(...)`, and call `.seal()` to complete the kind. Every instance must be created through that kind’s construction methods or its codec, so it must pass the validation and conversion logic in its Zod schema.
The completed definition controls how instances can be used: their internal state stays private, `.view(...)` declares what callers may read, and its Zod codec defines how they cross boundaries. 
Callers cannot create a genuine instance simply by assembling an object with matching properties or casting it to the TypeScript type.

### `defineMinted()`: Require that specific logic has run before a value can be used

A minted value establishes that its configured `mint` producer successfully ran on an input and produced this result. It does not establish that the producer’s logic is correct or certify contextual facts such as existence, authorization, currentness, or persistence.

Sometimes valid individual values are not enough. You need to know that a particular set of rules has been applied to them together.

How often do you receive a `SomeInput`, then validate it again because its TypeScript type only tells you which properties it has?
Why can't the function require an input that has already passed those checks?

With `defineMinted()`, you put those rules in a `mint` function.
Its input can contain existing kinds, ordinary data, or both. After you complete the definition with .seal(), calling .mint(input) runs that function and creates an instance only if it succeeds.

A save function can then require a `SomeInput` instance. Callers must obtain one through a successful call to `SomeInput.mint(...)`.
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
import { defineKind, type ValueOf } from 'sealed-semantics';

const UserId = defineKind({
  kind: 'readme/user-id',
  schema: z.string().toLowerCase().regex(/^usr_[a-f0-9]{16,}$/),
}).view({
  suffix: spelling => spelling.slice(-6)
}).seal();

type UserId = ValueOf<typeof UserId>;

const user = UserId.codec.parse('USR_0123456789ABCDEF');
console.log(z.encode(UserId.codec, user));      // usr_0123456789abcdef
console.log(user.view.suffix);   // abcdef
```

`schema` is the Zod schema for the value. Its output becomes the private representation. Here, it validates the ID and normalizes it to lowercase. If input and private representation need different types, pass a `z.codec(...)` as the schema.

`.view()` declares the properties callers can read from that private representation. `view.suffix` exposes the final six characters.

`ValueOf<typeof UserId>` gives you the TypeScript type for instances produced by this kind definition. 
A function that accepts `UserId` cannot accidentally receive anything besides userIds of the defined kind. This means no ordinary string or a separately defined `ProjectId`, nor someone trying to bypass the function's signature as a workaround. If someone bypasses TypeScript with a cast, `UserId.is(value)` still checks whether the value is a real instance. A cast cannot create one.

## You can decode individual fields, or a whole response

Zod handles both directions. Use `UserId.codec.parse(input)` for unknown input, or `UserId.codec.safeParse(input)` to handle a validation error as a result. Use `z.decode(UserId.codec, input)` when the input is already statically typed. Use `z.encode(UserId.codec, value)` for output.

`sealed-semantics` does not add its own parse, decode, encode, or canonical methods. `.view(...)` and `.docs(...)` remain optional steps before `.seal()`.

For a request or response with several fields, a Zod schema saves you from manually decoding each one:

```ts
import { z } from 'zod';
import { defineKind, defineMinted, type ValueOf } from 'sealed-semantics';

const UserId = defineKind({
  kind: 'readme/user-id',
  schema: z.string().toLowerCase().regex(/^usr_[a-f0-9]{16,}$/),
})
  .view({ suffix: (spelling) => spelling.slice(-6) })
  .seal();
type UserId = ValueOf<typeof UserId>;

const ProjectId = defineKind({
  kind: 'readme/project-id',
  schema: z.string().regex(/^prj_[a-f0-9]{16,}$/),
}).seal();
type ProjectId = ValueOf<typeof ProjectId>;
const MembershipResponse = z.object({
  user_id: UserId.codec,
  project_id: ProjectId.codec,
});
const user = UserId.codec.parse('usr_0123456789abcdef');
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

That is what `defineMinted` is for. Its `.seal()` call finishes the definition; each later `.mint(input)` call runs the checks to create an instance. Here, it takes existing `ProjectId` and `UserId` instances and creates a new type:

```ts
const MembershipBatch = defineMinted({
  kind: 'readme/membership-batch',
  mint: (input: { projectId: ProjectId; userIds: readonly UserId[] }) => {
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
    project: z.encode(ProjectId.codec, batch.view.projectId),
    users: batch.view.userIds.map((id) => z.encode(UserId.codec, id)),
  });
}

const batch = MembershipBatch.mint({
  projectId: member.project_id,
  userIds: [user],
});
if (batch.ok) saveMembershipBatch(batch.value);
```

`saveMembershipBatch` can rely on `mint` having run. An ordinary object with the same properties will not pass the type check or the runtime `MembershipBatch.is` check. The batch contains at least one user, and `UserId.set()` removes duplicates by ID value, even when they are different JavaScript objects.

The batch stores a new array, and `view.userIds` returns a new copy each time. Editing the caller's array or the returned array therefore cannot change the stored list. This copying is part of the definition above: the library keeps state private, but it does not automatically copy or freeze that state for you.

You still have to write the right checks in `mint`. This example checks the IDs and the list; it does not check whether the users exist or whether the caller may add them to the project. A minted value has no boundary codec. It records that local checks ran; when saving, you explicitly encode the IDs it contains.

## Try the full examples

From a clone of this repository:

```sh
npm ci
npm run test:consumer
npm run examples --prefix examples/consumer
```

Start with the [example index](examples/consumer/src/examples/index.ts). It walks through a fake HTTP request and response, ID comparisons, a cache keyed by user IDs, and saving project memberships. Each section shows the relevant calls and explains the result. [Runners](examples/consumer/src/runners.ts) contain the sample data and logging.

The [membership workflow](examples/consumer/src/examples/define-minted/membership-workflow/membership-workflow.ts) goes one step further than this README: it first mints a plan from a `UserId` and a `ProjectId`, then mints a batch from several plans. The batch checks that all plans belong to the same project. The save function therefore receives something that has passed both stages. The example uses a fake database; it does not write to an external service.

For more detail, read about [what the library guarantees](docs/guarantees.md), [boundary and mint errors](docs/producer-results.md), [adding checked examples with `.docs()`](docs/documentation.md), and [testing your definitions](docs/laws.md). The [diagnostics guide](docs/diagnostics.md) explains configuration errors. To contribute, see [CONTRIBUTING.md](CONTRIBUTING.md). For publishing checks, see [releasing](docs/releasing.md). Report security issues using [SECURITY.md](SECURITY.md). Licensed under [MIT](LICENSE).
