# Compiler diagnostics

Allowed documentation and law-option types contain only capabilities present on the kind. Generic checks inspect keys actually supplied by the caller and attach an impossible `ConfigurationError<"explanation">` requirement when a prerequisite is absent. This preserves rejection and puts the reason and correction in the compiler message. TypeScript still supplies the error code and outer wording; object literals can report an unknown property before showing the explanation. No runtime properties or unsupported autocomplete suggestions are added. A language-service test checks the actual completion lists for semantic, derived, and projected kinds. TypeScript can still reduce intersections to `never`, for example when a forbidden definition option is explicitly assigned `undefined`; those assignments remain rejected.

| Invalid configuration | Explanation now included |
| --- | --- |
| Example `canonical` without a configured canonical | Add `canonical` to `defineKind(...)` or remove the example property. |
| `docs.view` without projections, including `view: {}` | Declare projections in `.view({ ... })` first. |
| Derived `examples` | Derived definitions have no wire representation; remove the examples. |
| Derived `canonical`, `allocate`, `encode`, or `equals` | These options are available only on semantic definitions. |
| Old `fields` option | Rename it to `view`. |
| Unknown definition option | Check its name; documentation belongs in `.docs(...)`. If inference falls back to the options constraint, TypeScript can instead report its normal unknown-property error. |
| Symbol-named options | Use a declared string option name. |
| Non-JSON wire schema input | Encode dates, bigints, and other non-JSON data as JSON wire data. This also rejects unknown and optional input types. |
| Wire schema with `any` input | Use a schema with a specific JSON input type. |
| Widened `string` kind | Use a string literal or `as const`. |
| Law `allocateArgs` without `allocate` | Declare an allocator or remove the generator. |
| Law encoder or canonical mutator without that operation | Remove the unsupported mutator. |
| Law view mutators without projections | Declare projections or remove the mutators. |

Previously improved cases remain covered: `ValueOf` on an unfinished builder explains that `.seal()` must be called; reserved and symbol-named projections explain the restriction at the configured item.

Normal TypeScript messages remain for wrong sample shapes, unknown documentation/projection names, malformed callbacks, missing required callbacks, wrong allocator arguments, wrong collection keys or values, readonly assignments, and absent instance members. These errors identify the property or the expected type already. Law view mutators now also use the exact declared projection names and result types, instead of an unrestricted string map with `any` arguments.

Remaining uses of `never` are not opaque configuration bans: throwing coercion methods never return; internal success/failure helpers use impossible result branches; internal conditional types use `never` when extracting absent or non-callable members; empty-key checks remove absent views; and the explanatory error requirements themselves cannot be constructed. A producer callback explicitly returning `never` still has an impossible output type. The library does not convert that output into an error marker or weaken it.

Compiler-output tests cover prerequisite failures for both object and scalar examples. Inference tests check that valid projection arguments, examples, allocator tuples, and completed value types remain precise. The package test compiles those constraints against emitted declarations. As elsewhere in TypeScript, caller-authored `any` and assertions can bypass static checks.

Semantic docs now require non-empty linked examples with input and encoded, plus canonical when configured. Projection docs require every declared name and a description. Missing members use TypeScript’s required-property diagnostics; removed independent example fields receive a migration message.
