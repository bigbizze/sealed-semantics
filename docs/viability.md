# Inference viability

The mandatory compile-only gate ran before runtime implementation.

`spike/initial.ts.txt` records the original `const S extends Base` test. TypeScript reported two unused `@ts-expect-error` directives: the decoded input and Parts parameters were `any`. That signature did not meet section 8.3.

The revised API uses `defineValue({kind, wire, decode}).with({toWireShape, ...})` and `defineDerived({kind, derive}).with({fields, ...})`. The first stage infers the producer output. The second stage contextually types all projections using that established type. This is the builder revision expressly allowed by sections 8.3 and 16.1. Input parameter annotations on `derive` and `allocate` define their domains; projection parameters need no annotations.

`npx tsc --noEmit` passed with the four reference shapes in `spike/inference.ts`. The assertions detect `any`, verify exact allocator and field types, check raw versus decoded composite data, and reject cross-kind assignments, equality, and non-JSON inputs. `spike/api.ts` contains declarations only. No runtime implementation existed at this gate.

Reproduction: copy `spike/initial.ts.txt` to a temporary `.ts` file inside `spike` and run the compiler to reproduce the two expected diagnostics; remove that copy afterward. Run `npm run typecheck` for the accepted shape.
