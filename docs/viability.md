# Inference viability

The mandatory compile-only gate ran before runtime implementation.

`spike/initial.ts.txt` records the original `const S extends Base` test. TypeScript reported two unused `@ts-expect-error` directives: the decoded input and Parts parameters were `any`. That signature did not meet section 8.3.

The revised API uses `defineValue({kind, wire, decode}).with({toWireShape, ...})` and `defineDerived({kind, derive}).with({view, ...})`. The first stage infers the producer output. The second stage contextually types all projections using that established type. This is the builder revision expressly allowed by sections 8.3 and 16.1. Input parameter annotations on `derive` and `allocate` define their domains; projection parameters need no annotations.

`npx tsc --noEmit` passed with the four reference shapes in `spike/inference.ts`. The assertions detect `any`, verify exact allocator and field types, check raw versus decoded composite data, and reject cross-kind assignments, equality, and non-JSON inputs. `spike/api.ts` contains the historical pre-amendment declarations only. No runtime implementation existed at this gate.

Reproduction: copy `spike/initial.ts.txt` to a temporary `.ts` file inside `spike` and run the compiler to reproduce the two expected diagnostics; remove that copy afterward. Run `npm run typecheck` for the accepted shape.

## Consumer constraints and alternatives

The accepted builder is implemented, not just proposed. `spike/inference.ts` now imports the real factories. It checks wrong wire outputs, wrong allocator outputs, invalid Parts access, invalid producer errors, non-JSON schemas, widened kind strings, unknown options, derived-only restrictions, and reserved field names. Diagnostics occur on the invalid configured property. All projection parameters are inferred from the previous producer stage. Mutable and explicitly readonly returns retain their exact types. The declaration-only original spike API is retained as gate evidence.

The first stage needs a declared input domain for `derive`; TypeScript cannot infer an unknown caller domain from a callback body. An annotation such as `(input: PrepareInput)` is necessary and intentional. Allocator parameter annotations likewise declare the caller contract. There are no manually supplied factory generic arguments.

| Shape | Inference and invalid-configuration behavior | Tradeoff |
| --- | --- | --- |
| Implemented producer then `.with(projections)` | Wire context types decode; its result types Parts; Parts types all projections. Exact-key checks reject unsupported configuration. | One additional call, with direct property diagnostics. |
| Schema-first fluent stages, such as `value(kind).wire(schema).decode(fn).with(ops)` | Each stage establishes the next input type and can prohibit invalid operation order through its return type. | More calls and public builder states; useful if the producer stage later gains more dependencies. |
| Explicit typed producer object, followed by `defineValue(producer, operations)` | Inferring the producer in an earlier statement gives the second argument a fixed Parts type. `satisfies` can validate the producer without widening it. | Extra variable and a separate schema-based helper or input annotation. Same runtime model is possible. |
| Explicit Parts schema plus wire schema | Schemas establish both callback domains before inference of callbacks. Mismatched return types receive compiler errors; a runtime Parts schema could validate outputs. | Duplicates the internal shape and adds validation/configuration beyond this specification. Not selected. |

The first two alternatives preserve the required runtime and type properties without a caller-supplied brand token. An explicit fresh type token could instead provide per-definition nominality, but changes the specification's chosen per-kind identity model and increases consumer work. None of these shapes can prove exclusive ownership, non-mutation, canonical compatibility, absence of `any` in caller-authored code, or finite JavaScript numbers from a `number` type. Those require runtime checks, law tests, and producer discipline.

## Accepted amendments

The producer/.with inference stages are unchanged. Instance types now preserve optional canonical() and the exact read-only property types under view. An empty view omits the instance member. Kind types carry map/set factories with exact key and value constraints. Same-kind branding is unchanged; the complete structural instance surface also includes the configured projections. The test suite checks actual compiler output for reserved names instead of accepting an opaque never-type error.

The optional `.docs()` stage uses completed wire and projection types. Compile-only tests reject wrong samples, missing canonical support, unknown view names, and raw/decoded nested wire confusion. `ValueOf` and allocator inference remain unchanged after documentation is attached.
