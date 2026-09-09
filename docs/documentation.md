# Executable documentation

`defineValue(...)` establishes the producer and `.with(...)` completes the kind. `.docs(...)` remains optional. When supplied, its metadata must describe the completed capabilities. It returns a new frozen kind with the same producer, codec, collections, and private brand. It validates metadata and executes semantic examples immediately. Invalid examples throw synchronously, including when a definition module is imported. Derived documentation checks do not call derive.

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
| Projection `description` | Required string; `.docs()` also rejects blank descriptions. |
| Projection `example` | Optional, typed as the projection result. |
| Derived `examples` | Absent: derived values have no wire or canonical representation. |

Both `input` and `encoded` use the schema input type, including raw nested codec data. `canonical` uses the completed canonical return type. Examples do not widen the semantic types. The independent `exampleWire` and `exampleCanonical` fields are removed; use linked `examples`. A separately declared examples array needs a non-empty tuple type or `as const` to establish that it contains an example.

Read the metadata through `Kind.documentation`. Its containers, examples array, example records, view map, and projection-description records are copied and frozen. The sample graphs themselves remain author-owned references and are not cloned or frozen. Calling `.docs(...)` again replaces the whole document in a new kind. Unsupported capabilities are absent from autocomplete; generic checks diagnose extra supplied keys. Keys erased by a wider TypeScript annotation cannot be checked statically.

## Validation at definition time

`.docs()` validates every linked example through the real Zod codec and `Kind.parse`, checks their brands and equality, and compares actual encoding and canonical output with the documented outputs. It reparses encoded output and checks stable encoding and equality. No CLI, module discovery, test-only docs import, or separate CI command is required. A test that imports the definition executes the check; compilation alone does not. A kind without `.docs()` remains valid.

Canonical comparisons support plain records, arrays, byte views, ArrayBuffers, dates, regular expressions, maps, sets, and cycles. Object prototypes must match. Opaque class instances and functions require reference identity; private state cannot be compared structurally. Frozen data compares by content. Accessor observations are read during comparison.

Derived documentation checks complete projection descriptions without calling the producer. Projection examples remain type-checked illustrations, not assertions tied to an input. Private ownership and arbitrary projection behavior still need the law harness and domain tests.

Validation runs on each `.docs()` call. It does not change subsequent parsing or encoding. Producers must therefore permit their ordinary callbacks to run during module initialization. The guarantee applies at validation time; sample graphs remain author-owned and must not be changed if the documentation is to remain accurate.

Metadata strings do not generate JSDoc comments. Use ordinary JSDoc on declarations for specific hover text. Future tooling can consume `Kind.documentation`; the core has no dependency on an editor plugin.


For example, if `input` is valid but the documented canonical value has a typo, `.docs()` throws with the kind, example index, and canonical mismatch. If `input` itself is invalid, that rejection occurs first. The examples are linked assertions about actual transformations, not just values that happen to have compatible TypeScript types.

See the [consumer definitions](../examples/consumer/src/definitions) for complete docs blocks, and [producer results](producer-results.md) for boundary parsing choices.
