# sealed-semantics

## Why

Typescript types mostly govern syntax:

> Is this thing a string or not? If this this thing is an object instead of a number, then this property on that object needs this type. etc.

AI agents often confuse locally coherent syntactical rules for globally coherent semantic ones. Human programmers are different in that they implicitly carry lots of semantic context in their heads when working in a repository they're familiar with, which they apply when making decisions.

A senior engineer who sees:

```ts
submitPayment(payment)
```
understands 20 necessary preconditions instantly. An AI doesn't necessarily see more than a callable function that needs objects of the payment shape.

You can try to address this with better context selection: graph traversal or RAG-like systems, or adding rules and heuristics like many people do with CLAUDE.md or AGENTS.md files, where you can try to solve this with updating CLAUDE.md or AGENTS.md stating:

> “Never call capturePayment unless…”

but then you're relying on the agent to remember. you're also encoding just one rule of the N you'll need with this approach where their ability to remember decreases proportional to N increasing. 

So why don't we strive to make these implicit rules explicit, so that they're impossible to use incorrectly? AI agents don't get annoyed with strictness and rules in the way humans do, so the cost of making these things impossible by construction seems marginal today. 

___

The goal of this repository is to add two semantic datatype producers, both of which strive to create much stronger guarantees around making invalid semantic state impossible to use.

This comes from two distinct things: semantic seals, which are values, and semantic mints, which are wrapped datatypes that include a contract about rules and transformations any value of this mint type has undergone.

**defineSeal** creates seals. They differ from  only using typescript types because seals have much stronger guarantees around the provenance of their data. Once a definition for a seal is provided, the only place that can create new values of that seal is Zod parse. The only methods that can be used to interact with a value of that seal are those in the definition. This allows you to distinguish between something that was merely produced from something that is legitimately entitled to be relied upon.

```ts
const UserId = defineSeal({
  key: id => id, // key for checking equality between instances of this seal. `schema` can be an object, or anything, meaning complex keys can be needed for reference
  name: 'app/user-id', // globally unique namespace for this seal.
  schema: z.string().toLowerCase().regex(/^usr_[a-f0-9]+$/), // regular zod schema for handling serialization
})
  .view({ // You can define methods on the seal here.
    suffix: id => id.slice(-6),
    uiDisplay: id => `User ID: ${id}` 
   })
  .seal(); // Make the seal immutable from here.

type UserId = ValueOf<typeof UserId>;
```

seals are meant to trasit across serialization boundaries with no issues. they use zod for encoding and decoding as you already would.

---

**defineMint** creates contracts that couple a typescript types to some set of rules specified in its definition. This means that when a function wants to only accept Payment objects, where payment object really means "Only payment objects that are validated, authorized and time-stamped through the officially sanctioned paths for doing such things in this repo", having PaymentObject be defined as just a typescript types which has these 3 string properties and one boolean is obviously not ideal. If PaymentObject were a minted datatype (we could call this `PaymentReady`), those requirements could be added to it's mint function, it's value guaranteed to have been run through them, and only values produced by `mint()` be allowed to be passed to functions expecting PaymentObject.

```ts

type PaymentObject = {
  recipientId: UserId,
  amountCents: number,
  currency: 'USD' | 'EUR'
};

const PaymentReady = defineMint({
  name: 'app/payment',
  mint: (input: PaymentObject) => {
    if (
      !UserId.is(input?.recipientId) ||
      !Number.isSafeInteger(input?.amountCents) ||
      input.amountCents <= 0 ||
      !['USD', 'EUR'].includes(input.currency)
    ) {
      return {
        ok: false,
        error: {
          code: 'invalid_payment',
          message: 'Expected a recipient, a positive whole-cent amount, and USD or EUR.',
        },
      };
    }

    return {
      ok: true,
      value: {
        recipientId: input.recipientId,
        amountCents: input.amountCents,
        currency: input.currency,
        preparedAt: Date.now(),
      },
    };
  },
})
  .view({
    recipientId: p => p.recipientId,
    amountCents: p => p.amountCents,
    currency: p => p.currency,
    preparedAt: p => p.preparedAt,
  })
  .seal();

type PaymentObject = ValueOf<typeof PaymentObject>;

```

Then any function taking `PaymentReady` as an argument can work from the guarantees this creates.

You can also create minted datatypes which include seals, or other mints. This allows the semantic attestations to compose naturally.

One result of this approach is that AI-generated code can't merely discover the shape of an execution-eligible value  and recreate it locally. It has to find the producer that is capable of minting one.

mints should never cross serialization boundaries and are non-serializable. This is because producing a mint from plain JSON means making a claim about the data outside of what its contract can attest to as it's currently constructed. (There are of course some fun ways one might think about making this not an issue! Not for now though.)

___

## AI Generated Description:

Define values once. Make their construction rules, identity, and permitted observations part of the API.

This package is for TypeScript codebases where an object with the right properties is not enough. You need to know how it was created.

This matters particularly in agent-heavy codebases. An engineer may remember that a value must pass a shared validator. An agent working on one function may instead assemble a matching object and add local helpers. The change can look reasonable while bypassing rules elsewhere in the application.

A carefully written class with a private constructor and ES private fields can enforce controlled construction manually. TypeScript and JavaScript can implement these mechanisms without this package. `sealed-semantics` standardizes the complete convention: runtime nominal identity, Zod codec composition, hidden state, controlled projections, semantic identity, mint-event provenance, executable documentation, and laws.

## Two primitives

**`defineSeal` represents a semantic value.** Equivalent decoded values from one completed definition are the same live JavaScript object. Compare them with `===`. Use native `Map` and `Set`.

**`defineMint` represents a successful mint event.** Every successful `.mint(input)` call creates a distinct object. A downstream function can require that object as evidence that the configured producer succeeded.

You supply the checks. The library prevents callers from creating a genuine instance without passing through its construction path. It does not prove that your checks are correct. Accepting a user ID does not prove that a database row exists, or establish authorization, persistence, or currentness.

## Requirements

Use Node 22+, TypeScript 5.7+, and Zod >=4.1 <5. The core is browser-compatible. It requires `WeakRef` and `FinalizationRegistry` and throws a clear error at import if either is unavailable. There is no fallback.

For Cloudflare Workers with weak references disabled, enable `enable_weak_ref` and remove `disable_weak_ref`. See [runtime requirements](docs/guarantees.md#runtime-requirements).

```sh
npm install sealed-semantics zod
```

## Define an identifier

```ts
import { z } from 'zod';
import { defineSeal, type ValueOf } from 'sealed-semantics';

const UserId = defineSeal({
  key: parts => parts,
  name: 'app/user-id',
  schema: z.string().toLowerCase().regex(/^usr_[a-f0-9]+$/),
})
  .view({ suffix: spelling => spelling.slice(-6) })
  .seal();
type UserId = ValueOf<typeof UserId>;

const a = UserId.codec.parse('USR_0123456789ABCDEF');
const b = UserId.codec.parse('usr_0123456789abcdef');
console.log(a === b); // true
console.log(a.view.suffix); // abcdef
console.log(z.encode(UserId.codec, a)); // usr_0123456789abcdef
const users = new Map<UserId, string>([[a, 'Alice']]);
console.log(users.get(b)); // Alice
```

The schema validates and normalizes input. Its output becomes the private representation, called **Parts**. Interning happens after that normalization. It makes semantic identity coincide with object identity; it is not a promise of faster parsing.

Call `.docs(...)`, `.view(...)`, and `.copy(...)` in any order; `.seal()` must come last and checks documentation against the final view and copy observations. Completed definitions have no builder methods.

`ValueOf<typeof UserId>` gives the instance type. A cast cannot construct an instance. `UserId.is(value)` checks the actual private brand.

## You can decode individual fields, or a whole response

Zod owns representation boundaries. Use `Seal.codec.parse(unknown)` or `safeParse(unknown)` for external input. Use `z.decode` for statically typed input, and `z.encode` for output. A composed schema handles nested seals and arrays without field-by-field conversion.

```ts
import { z } from 'zod';
import { defineSeal, defineMint, type ValueOf } from 'sealed-semantics';

const UserId = defineSeal({
  key: parts => parts,
  name: 'app/user-id',
  schema: z.string().toLowerCase().regex(/^usr_[a-f0-9]+$/),
}).seal();
type UserId = ValueOf<typeof UserId>;

const ProjectId = defineSeal({
  key: parts => parts,
  name: 'app/project-id',
  schema: z.string().regex(/^prj_[a-f0-9]+$/),
}).seal();
type ProjectId = ValueOf<typeof ProjectId>;

const ResponseSchema = z.object({
  user_id: UserId.codec,
  project_id: ProjectId.codec,
});
const response = ResponseSchema.parse({
  user_id: 'USR_123ABC',
  project_id: 'prj_123abc',
});
console.log(z.encode(ResponseSchema, response));
// { user_id: 'usr_123abc', project_id: 'prj_123abc' }
```

Use a `z.codec(...)` as the definition's schema when external input and Parts have different types. Normalize in that schema before identity is computed. One-way Zod transforms can decode but cannot encode backward.

## Every seal declares its identity key

Every `defineSeal` requires `key`, including primitive Parts. Use `key: id => id` for a normalized string identifier. Supported keys are strings, numbers, bigints, booleans, `null`, and `undefined`. Symbols are not semantic keys.

For structured Parts, choose a key that identifies the complete value:

```ts
const Coordinate = defineSeal({
  name: 'geo/coordinate',
  schema: z.object({ lat: z.number(), lng: z.number() }),
  key: p => `${p.lat}:${p.lng}`,
}).seal();
const c1 = Coordinate.codec.parse({ lat: 1, lng: 2 });
const c2 = Coordinate.codec.parse({ lat: 1, lng: 2 });
console.log(c1 === c2); // true
```

The key is the declared identity, not a hash hint. Parts must already be normalized for that identity. On a live hit, the library compares the Parts structurally. A key collision between different Parts throws instead of returning the wrong value. Errors include the seal and key, not private Parts.

Keyed Parts support primitives, plain data objects, dense arrays, `Date`, and sealed values as atomic leaves. Dates compare by timestamp. Cycles, accessors, hidden properties, symbol keys, typed arrays, and other class instances are rejected on the first decode. Shared acyclic children are allowed.

Keys use `Object.is` value semantics: `0` and `-0` are distinct keys, and all `NaN` keys share one key. The schema must accept or produce those values first. This does not make non-finite numbers valid JSON.

## Require checks before saving

A save function can require a minted batch containing validated IDs. The producer below requires a non-empty list and removes repeated users.

```ts
const MembershipBatch = defineMint({
  name: 'app/membership-batch',
  mint: (input: { projectId: ProjectId; userIds: readonly UserId[] }) => {
    if (!ProjectId.is(input?.projectId) ||
        !Array.isArray(input?.userIds as unknown) ||
        input.userIds.length === 0 ||
        !Array.from(input.userIds).every(id => UserId.is(id))) {
      return {
        ok: false,
        error: {
          code: 'invalid_membership_batch',
          message: 'Expected a project and at least one user.',
        },
      };
    }
    return { ok: true, value: {
      projectId: input.projectId,
      userIds: [...new Set(input.userIds)],
    } };
  },
})
  .view({
    projectId: p => p.projectId,
    userIds: p => p.userIds
  })
  .seal();

type MembershipBatch = ValueOf<typeof MembershipBatch>;

function saveMembershipBatch(batch: MembershipBatch) {
  console.log('Save:', {
    project: z.encode(ProjectId.codec, batch.view.projectId),
    users: batch.view.userIds.map(id => z.encode(UserId.codec, id)),
  });
}
const input = { projectId: response.project_id, userIds: [response.user_id] };
const first = MembershipBatch.mint(input);
const second = MembershipBatch.mint(input);
if (first.ok && second.ok) {
  console.log(first.value === second.value); // false: two mint events
  saveMembershipBatch(first.value);
}
```

The producer owns its error format. `ProducerResult<Parts, Error>` can describe object unions or primitive errors; `.mint()` returns failures unchanged. Typed internal functions trust their parameters. Check runtime brands only at untyped or adversarial boundaries.

The library ensures that the producer succeeded. The producer defines what that success means. This example does not check user existence or permission to change project membership.

## Stable, immutable views

Each view projection runs lazily. Its first successful result is validated, deeply frozen, and cached. Later reads return exactly that result, including `undefined` and other falsy values. Failed projections can be retried.

Views allow primitives, sealed values, dense arrays, and plain data objects. Structured observations are deeply readonly in TypeScript. Functions, Dates, collections, other class instances, accessors, hidden properties, symbol-keyed structures, and cycles are rejected on access. Genuine sealed leaves from this installed package copy retain their exact type and remain usable. An ES-private brand authenticates them. The well-known name symbol is only a diagnostic label; fake objects and values from another installed copy are rejected as graph leaves.

For digests and other byte-valued data, keep canonical string Parts and declare `.copy({ bytes: ... })` for a stable byte observation returned as a fresh `Uint8Array` at the binary API boundary. Buffers are mutable representations, not identity-bearing values or view outputs. See [digests and byte buffers](docs/bytes.md).

The library does not deep-freeze all private Parts merely because they are sealed. Anything exposed through `view` becomes deeply immutable. Parts must remain logically immutable after sealing. If a projection returns an internal array, that array is frozen too. Producers must not retain aliases that they later mutate.

## Definition identity and development

A sealed value belongs to exactly one completed definition instance. `Seal.is(value)` is true only for that instance's values. Two definitions may use the same `name` string. They are unrelated, and their values are foreign to each other. The string is a diagnostic label, not runtime identity.

Re-executing a definition module creates a new definition instance. Older values still work, but the new codec rejects them with a diagnostic. After editing a definition, refresh the page or restart the process to clear preserved state.

Next.js dev, Vite, Vitest, Jest, and Node's test runner need no package-specific configuration. The package holds no global state that can survive a module reset. See [framework guidance](docs/frameworks.md).

TypeScript cannot generate a fresh nominal type for each factory call. Literal definition names distinguish types statically, but two definitions using the same name can have compatible TypeScript types. Runtime brands and codecs remain authoritative.

## React and representation boundaries

Equivalent decodes from one definition return the same live object. Semantic values can be used in React state and dependency arrays. Cached structured views do not need caller-written `useMemo` just to stabilize their references.

Object identity does not cross workers, processes, server/client, network, or storage boundaries. Encode through Zod, transfer plain data, then decode with the receiving definition.

Console inspection shows `Sealed<app/user-id>` without encoding, revealing Parts, or calling `debug()`. `JSON.stringify(value)` still throws. Structured/JSON logging requires explicit Zod encoding. Minted values are local construction attestations in the current API. Crossing a serialization boundary requires establishing the claim again on the receiving side.

In Jest and Vitest, use `toBe` to test identity. Two distinct minted values can pass `toEqual` because their private state is not enumerable.

## Examples and verification

```sh
npm ci
npm run check
npm run examples --prefix examples
```

The [consumer walkthrough](examples/src/examples/README.md) demonstrates HTTP requests, native caches, and a save function that requires minted plans and batches. It imports the package through its public exports.

Read the [guarantees](docs/guarantees.md), [specification](docs/specification.md), [documentation guide](docs/documentation.md), [laws](docs/laws.md), and [error guide](docs/producer-results.md). See [CONTRIBUTING.md](CONTRIBUTING.md), [release checks](docs/releasing.md), and [SECURITY.md](SECURITY.md). Licensed under [MIT](LICENSE).

### Owned bytes belong in `.copy`

Use `.view({ hex: ... })` for stable immutable observations and `.copy({ bytes: ... })` for fresh owned `Uint8Array` storage. On the first successful `digest.copy.bytes()` call, the producer runs and the library copies its bytes into a private snapshot. Every call returns a new array from that snapshot. Mutating a returned array or a retained producer result cannot change later copies.

Only Uint8Array is supported. Buffer producer output is accepted but returned as plain Uint8Array. Shared backing memory is rejected. The definition author is responsible for what the bytes mean; the library enforces storage isolation and stable contents, not purity or semantic correctness. Copy observations do not replace Zod encoding or give minted values a codec. See [the complete digest example and copying rules](docs/bytes.md).
