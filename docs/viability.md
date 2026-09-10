# Type inference and API checks

Private Parts are inferred from the Zod schema output. Key and debug callbacks receive that type. `.view()` supplies a separate inference stage. `.seal()` completes the definition. Optional documentation follows view configuration.

`spike/inference.ts` checks precise codec input/output, required object keys, rejected primitive key overrides, readonly nested views, terminal sealed leaves, allocation arguments, exact documentation, and minted inputs containing different kinds.

Compiler-output tests verify readable diagnostics. Language-service tests check member lists for primitive and object definitions, builders, completed kinds, instances, documentation, and laws. Both TypeScript 5.7 and the development compiler run the constraints.

TypeScript cannot create a fresh nominal identity for every generic factory invocation. Same-label definitions may be statically compatible. Runtime private brands distinguish them. Types also cannot reliably identify every class prototype or accessor; runtime domain checks remain authoritative.
