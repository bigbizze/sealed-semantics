# Consumer example

This is a separate TypeScript package inside the library repository. It demonstrates using `sealed-semantics` through its public package exports.

From the repository root:

```sh
npm ci
npm run test:consumer
npm run examples --prefix examples/consumer
```

From this directory, use `npm test`, `npm start`, or `npm run examples`. `npm run test:unit` runs the tests without the console demonstration. Root `npm run check` and CI include the consumer checks.

## Where to start

| File or directory | Purpose |
| --- | --- |
| [src/examples/index.ts](src/examples/index.ts) | Read the important API calls in order, with section descriptions. |
| [src/runners.ts](src/runners.ts) | Request fixtures, fake database adapters, detailed logging, and result checks. |
| [src/definitions](src/definitions) | `UserId`, `ProjectId`, and `PreparedMembership` definitions. |
| [src/examples/define-value](src/examples/define-value) | HTTP validation and profile caching. |
| [src/examples/define-derived/membership-workflow](src/examples/define-derived/membership-workflow) | A checked batch and the save function that requires it. |
| [test](test) | Runtime rejection tests and compile-time checks, including exact projection types. |
| [src/index.ts](src/index.ts) | Runs the demonstration and re-exports the definitions. |

The seven sections demonstrate:

1. Decode an HTTP response through a Zod schema or individual `parseOrThrow()` calls.
2. Compare independently parsed values with `.equals()` and encode the response again.
3. Handle invalid input as an HTTP response, a result object, or an exception.
4. Reuse a cached profile across accepted spellings of one user ID.
5. Derive a plan from both ID types, derive a batch, and pass it to a function that requires it.
6. Reject mixed projects, empty selections, and invalid IDs before a database write.
7. Process a complete add-members request.

The HTTP server accepts in-memory `Request` objects and returns `Response` objects. Database adapters print or record calls. Neither opens a server port nor writes to an external database. See the [application guide](src/examples/README.md) for the individual workflows.

## Local dependency and WebStorm

`package.json` uses `"sealed-semantics": "file:../.."`. `.npmrc` sets `install-links=true` to install a package copy. A symlink to the parent repository would create a directory cycle through the consumer's own `node_modules` and can confuse IDE indexing.

Before build, typecheck, or dev, `refresh:library` builds the root library and reinstalls the consumer's locked dependencies without dependency lifecycle scripts. Run it manually after library edits if you execute source directly in the IDE. The root library's development dependencies must already be installed.

Relative imports use `.ts`. The compiler rewrites them for built JavaScript; Node 24 can run the source with `npm run dev`. Direct Node execution does not type-check. In WebStorm, select this package's `node_modules/typescript` for its pinned compiler.

## When checks run

`.docs()` validates while a definition module loads. A wrong example fails tests that import that definition and application startup. No separate documentation command is needed.

Duplicate names fail when both definitions complete in the same realm. Compiling a file does not execute it, and an unused file is not automatically imported. Separate test processes have separate registries.
