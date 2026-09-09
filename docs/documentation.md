# Executable documentation

`defineValue(...)` establishes the producer and `.with(...)` completes the kind. `.docs(...)` remains optional. When supplied, its metadata must describe the completed capabilities. It returns a new frozen kind with the same producer, codec, collections, and private brand. It does not run schemas, decode, derive, encode, or canonical callbacks.

```ts
.docs({
  description: 'A normalized user identifier.',
  examples: [{
    input: 'user:550e8400-e29b-41d4-a716-446655440000',
    encoded: 'usr_550e8400e29b41d4a716446655440000',
    canonical: {
      type: 'utf8',
      value: 'usr_550e8400e29b41d4a716446655440000',
    },
  }],
  view: {
    suffix: { description: 'The final six characters.', example: '440000' },
  },
})
```

| Metadata | Requirement |
| --- | --- |
| `description` | Optional string. |
| Semantic `examples` | Required non-empty array. |
| Example `input` | Required raw wire input accepted by the grammar. |
| Example `encoded` | Required normalized raw wire output. |
| Example `canonical` | Required in every example iff the kind declares canonical; otherwise absent. |
| `view` | Required iff projections are declared, with exactly their names. |
| Projection `description` | Required string; the runtime docs checker also rejects blank descriptions. |
| Projection `example` | Optional, typed as the projection result. |
| Derived `examples` | Absent: derived values have no wire or canonical representation. |

Both `input` and `encoded` use the schema input type, including raw nested codec data. `canonical` uses the completed canonical return type. Examples do not widen the semantic types. The independent `exampleWire` and `exampleCanonical` fields are removed; use linked `examples`. A separately declared examples array needs a non-empty tuple type or `as const` to establish that it contains an example.

Read the metadata through `Kind.documentation`. Its containers, examples array, example records, view map, and projection-description records are copied and frozen. The sample graphs themselves remain author-owned references and are not cloned or frozen. Calling `.docs(...)` again replaces the whole document in a new kind. Unsupported capabilities are absent from autocomplete; generic checks diagnose extra supplied keys. Keys erased by a wider TypeScript annotation cannot be checked statically.

## Tests and CI

Import `assertValueDocs`, `assertDerivedDocs`, or `assertDocs` from `sealed-semantics/docs`. This Node-only entry needs no fast-check dependency. The same functions are re-exported by `sealed-semantics/laws` for existing test setups.

`assertValueDocs(Kind)` checks documentation completeness and every linked example. It validates through the real Zod codec with `safeDecode`, parses through `Kind.parse`, checks both brands and their equality, and deeply compares actual encoding and canonical output with the documented outputs. It reparses the encoded output and checks stable encoding and equality. Canonical values are computed from the parsed value, not from the encoded string. A grammar or implementation change can therefore fail CI even when the example still type-checks.

`assertDerivedDocs(Kind)` checks the complete projection descriptions without calling the producer or inventing an input. Projection-level examples remain type-checked illustrations; they are not tied to a particular linked input. Private ownership and arbitrary projection behavior still need the law harness and domain tests.

`assertDocs([UserId, ProjectId, PreparedMembership])` requires documentation for every listed kind and reports failures together. The CLI enforces the same policy for direct exports of explicitly selected modules:

```sh
sealed-semantics check-docs dist/definitions.js
```

Use a barrel module that exports all definitions in the project. The command imports and executes the specified modules; use normal built JavaScript for Node 22 compatibility. It does not scan the source tree, traverse nested export objects, or discover unexported definitions. Duplicate re-exports of the same kind object are checked once. No definitions found is an error. Include the command in the project's CI if documentation is mandatory.

Capability inspection uses a private WeakMap: it stores only flags and projection names, not Parts, and cannot enumerate definitions. Use the checker from the package copy that created the kinds. A foreign-copy kind is rejected with an explanation instead of silently skipping its requirements.

Metadata strings do not generate JSDoc comments. Use ordinary JSDoc on declarations for specific hover text. Future tooling can consume `Kind.documentation`; the core has no dependency on an editor plugin.
