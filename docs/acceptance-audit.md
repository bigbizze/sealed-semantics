> Historical baseline audit for commit cdf295e. For current usage, see the [README](../README.md) and [guarantees](guarantees.md); for implementation changes, see [amendments.md](amendments.md) and run the current check and package scripts. Counts and API locations below describe the original baseline.

# Revision 5 acceptance audit

This audit maps the original specification to the implemented package. The API syntax change is the inference-gate revision authorized by sections 8.3 and 16.1, not a reduction of runtime scope.

| Requirement | Current evidence |
| --- | --- |
| §1 two constructors; no claims about contextual facts | `src/index.ts` implements semantic and derived constructors; `docs/guarantees.md` states both meanings and all six excluded claims. |
| §1.2 no interning, generic Parts cloning/freezing, plugin system, or Result library | `src/index.ts` and `src/seal.ts` use one fresh instance per successful acquisition and only ok/err discriminants. Parts are not traversed. The runtime test asserts independent parses are distinct. |
| §2 RawWire versus DecodedWire | `src/types.ts`, the composite inference assertions, and the nested codec runtime test verify input strings versus decoded sealed values. |
| §3 layout, peer dependency, and size | All named source files, CLI, and documentation exist. `package.json` has only Zod as a runtime peer and no runtime dependencies. `npm run check:size` counts 394 lines across src and bin, including types and laws; README has 117 lines. |
| §4 inferred API and error union | `src/types.ts` and `src/index.ts`; negative and exact-type assertions in `spike/inference.ts`, also compiled from an installed tarball. |
| §4.1 JSON constraint and optional semantic operations | Type tests reject Date, bigint, unknown, and optional boundaries and invalid allocator/output types. Optional members are conditionally present; runtime examples exercise canonical and allocate. |
| §4.2 derived restrictions | Types reject semantic options on derived definitions; runtime rejects those options too. Derived law tests assert no encoding/canonical surface. |
| §§5–6 instance/kind surfaces | Runtime export and member checks; all common law checks; exact allocator, field, canonical, and ValueOf type assertions. README uses standalone Zod APIs for compatibility with 4.1.0. |
| §7.1 private-field brand and static bridge | `src/seal.ts` static block names the private field. Runtime tests reject prototype forgery, proxies, forged codec outputs, recovered construction, and invalid projection/encode/equality receivers. |
| §7.2 one acquisition path | parse and allocate share parse; codec and derive share the same per-definition seal closure. Result tests and law acquisition tests exercise all paths. |
| §7.3 ownership and non-mutation | Obligations are reproduced verbatim in `guarantees.md`. Law tests mutate all example projections; unit tests change producer inputs, canonical bytes, and repeat callbacks. Tests demonstrate sampled behavior, not a proof of producer discipline. |
| §7.4 and §8.2 duplicate kinds | Runtime tests cover semantic and derived duplicates. Package smoke tests cover duplicate completion through separate installed package copies. The former scanner has been removed. |
| §8.1 nominality | Exact same-kind brand assertion and negative cross-kind equality, assignment, and structural construction tests. Package smoke creates equal kind literals in separate physical copies and verifies distinct runtime brands. |
| §8.3 mandatory first gate | Commit `b4754bb` contains declaration-only API tests before runtime implementation. The original signature fails two diagnostic expectations; the revised builder passes all four reference shapes. `viability.md` records evidence and alternative schemas. |
| §9 deterministic keys, semantic and identity collections | Keying tests cover sorting, escaping, array order, repeated references, rejected domains, and negative zero. Runtime and law tests cover normalized semantic lookup, derived identity, original-key iteration, callbacks, deletion, clearing, invalid keys, and non-leaking entry arrays. |
| §9.3 no registry or single-copy requirement | Collections read the supplied kind directly. Package smoke imports collections from a second physical package copy for first-copy semantic and derived values. |
| §10 codecs and separate parse Result | Runtime tests verify raw nested output, output-schema forgery rejection, custom Zod issues, thrown Zod errors, invalid_wire Results, and preserved producer error object identity. |
| §11 laws 1–13 | `test/laws.test.ts` applies the semantic harness to UserId, Sha256Digest, ContentAddress, and supporting NamespaceId. UserId supplies alias pairs and allocator arguments. The harness also checks collection agreement. |
| §11 laws 14–17 | The derived reference uses rows containing sealed content addresses. All common laws and derived identity/collection laws run on generated inputs. |
| §11 mutation and number test contract | Harness self-tests detect a nested alias leak, incorrect equality, unsupported custom mutation types, and non-finite wire numbers; supplied Date mutators and negative zero pass. Limits are documented in `laws.md`. |
| §12 errors | Runtime unit tests and common laws cover invalid_wire, invalid_parts, invalid_input, preserved errors, Zod custom issues, and programming-error TypeErrors. |
| §13 documents | `guarantees.md`, `laws.md`, and `methods-on-canonical-instances-vs-static-method-import.md` cover the required distinctions, tradeoffs, obligations, and limits. |
| §14 README usability | The README contains self-contained identifier, digest, composite, and derived definitions. Package smoke extracts its TypeScript, compiles it against installed declarations, and runs it. |
| §15 all test categories | Compile-only, property, runtime, example-contract, scanner, and package-consumer suites exist. No test uses a construction backdoor. |
| §16 acceptance criteria 1–9 | Covered by the entries above, the build, complete test suite, scanner, size check, and isolated package installation. |
| User request: alternative ergonomic constraints | `viability.md` compares the implemented staged builder, schema-first stages, typed producer objects, and an explicit Parts schema. Negative consumer tests verify diagnostics against the emitted declarations. |
| User request: shareable npm repository | Git repository at `~/c/sealed-semantics`; package exports, declarations, source maps, license, README, release procedure, CI configuration, executable scanner, and tested tarball. No external publication is required to share the tarball. |

Verified locally on Node 22.14.0 with Zod 4.1.0 and 4.5.4, using TypeScript 7.0.2 and the 5.7.3 compatibility check. The complete suite has 14 tests, including property runs over all reference kinds. Both peer versions passed isolated tarball consumer checks. CI is configured for Node 22 and 24 but has not run on a hosted service.

Reproduce with `npm ci`, `npm run check`, `npm exec --package=typescript@5.7.3 -- tsc --noEmit`, `npm run test:package`, and `npm run test:package -- 4`. The latter resolves current Zod 4; the lockfile retains the minimum peer version for ordinary repository checks.
