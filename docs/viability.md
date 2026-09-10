# Type inference and API checks

The API infers the private representation directly from `z.output<typeof schema>`. An identity schema needs no conversion callbacks. A Zod codec can give input and output different types; projections, custom equality, and debug receive its output type.

`spike/inference.ts` checks schema input, sealed output identity, primitive and object projection inference, allocation arguments, exact documentation keys, and minted inputs containing different sealed kinds. Invalid calls use `@ts-expect-error`, so removing a constraint fails the compiler check.

TypeScript 5.7 and the development compiler run the same checks. Compiler-output tests verify readable errors for incomplete builders, removed callbacks, invalid schemas, missing documentation prerequisites, and invalid law options. Language-service tests verify that autocomplete suggests only supported capabilities.

`defineKind` accepts a schema with JSON-compatible input; output may be richer, including bytes, dates, and nested sealed values. `z.any()` input is rejected. TypeScript cannot prove schema refinements or backward encodability. A one-way Zod transform throws during encoding; use a codec for bidirectional conversions.

Type assertions and JavaScript can bypass static checks. Runtime configuration validation and private brands remain necessary. A kind string brands the type; realm-wide duplicate rejection prevents two completed definitions with that identity from coexisting in one realm.
