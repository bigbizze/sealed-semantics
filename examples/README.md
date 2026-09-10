# Consumer example

This is a separate TypeScript package inside the library repository. It demonstrates using `sealed-semantics` through its public package exports.

From the repository root:

```sh
npm ci
npm run test:consumer
npm run examples --prefix examples
```

From this directory, use `npm test`, `npm start`, or `npm run examples`. `npm run test:unit` runs the tests without the console demonstration. Root `npm run check` and CI include the consumer checks.

## Where to start

Each file contains one complete example, including application logic, fixtures, calls, and logging:

| File | Example |
| --- | --- |
| [http-contract.ts](src/examples/http-contract.ts) | A fake HTTP server, client request, response decoding, identity comparison, and invalid input. |
| [profile-cache.ts](src/examples/profile-cache.ts) | A native Map cache where normalized aliases share a database lookup. |
| [membership-workflow.ts](src/examples/membership-workflow.ts) | Mint plans and a batch, save the batch, reject invalid requests, and process a complete request. |

Shared identifier definitions are in [src/definitions](src/definitions). Runtime and compile-time checks are in [test](test).

Run all three with `npm run examples`. To run one after `npm run build`:

```sh
node dist/examples/http-contract.js
node dist/examples/profile-cache.js
node dist/examples/membership-workflow.js
```

On Node 24, you can also run a source file directly, for example `node src/examples/http-contract.ts`. Refresh the library first with `npm run refresh:library` after changing it.

The HTTP server handles in-memory Request and Response objects. Database adapters log calls. These examples do not open ports or write to an external database.

## Local dependency and WebStorm

`package.json` uses `"sealed-semantics": "file:.."`. `.npmrc` sets `install-links=true` to install a package copy. A symlink to the parent repository would create a directory cycle through the consumer's own `node_modules` and can confuse IDE indexing.

Before build, typecheck, or dev, `refresh:library` builds the root library and reinstalls the consumer's locked dependencies without dependency lifecycle scripts. Run it manually after library edits if you execute source directly in the IDE. The root library's development dependencies must already be installed.

Relative imports use `.ts`. The compiler rewrites them for built JavaScript; Node 24 can run the source with `npm run dev`. Direct Node execution does not type-check. In WebStorm, select this package's `node_modules/typescript` for its pinned compiler.

## When checks run

`.seal()` validates any supplied `.docs()` examples while a definition module loads. A wrong example fails tests that import that definition and application startup. No separate documentation command is needed.

Module re-execution creates independent definitions. Old values stay valid for their original definition, but a new codec rejects them with a foreign-definition diagnostic.
