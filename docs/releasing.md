# Preparing a release

This repository builds an ESM npm package with declaration files. The package exports the main API and the Node-only law harness. Internal modules are blocked by the package export map. No executables or public docs checker are shipped. Documentation validates synchronously through the main API. Zod is required; fast-check is an optional peer for the law harness. Main-only installation is verified without fast-check, followed by a separate installation for law tests.

1. Run `npm ci` and `npm run check`.
2. Run `npm run test:package` for the minimum Zod version, then `npm run test:package -- 4` for current Zod 4.
3. Run `npm run typecheck:5.7` to check the minimum TypeScript version.
4. Inspect `npm pack --dry-run`. `npm pack` runs the checks through prepack and creates `sealed-semantics-0.3.5.tgz` for the current version.
5. Share the tarball directly with `npm install /path/to/sealed-semantics-0.3.5.tgz`, or publish with `npm publish --access public` from an authorized npm account after choosing the final version and package name.

No npm publication, remote repository, or release tag is created by these checks. Repository, homepage, and issue links point to `bigbizze/sealed-semantics` on GitHub.

The package smoke test installs the real tarball in a temporary consumer. It compiles and runs the opening README example and the standalone walkthrough (starting at “You can decode individual fields, or a whole response”), checks invalid consumer configurations against the emitted declarations, imports the test-only harness, tests collections across two physical package copies, confirms private subpaths cannot be imported, checks foreign-definition diagnostics and synchronous documentation validation, and verifies that no CLI or public docs checker is exported. Temporary consumer files are removed; the tarball remains in the repository directory.

The checked-in CI configuration repeats checks on Node 22 and 24 with Zod 4.1.0 and current Zod 4. Local evidence does not imply that hosted CI has run. Review semantic keys and encoded examples before publishing.

`npm run check` also installs and tests the separate package in `examples`. It imports the root library through `file:..` and its public package exports, with its own compiler configuration and lockfile. Its `install-links=true` setting installs a package copy, and its command hooks build and refresh that copy before use. The tarball smoke test remains separate and checks the published artifact. Consumer sources and dependencies are not included in the published package.


## What each check covers

| Command | Purpose |
| --- | --- |
| `npm run check` | Formatting, main type checks, library tests, README links and code fences, build, and the consumer tests plus runnable demonstration. |
| `npm run test:consumer` | Refresh the installed local package, check the consumer types, run its tests, then execute its demonstration. |
| `npm run examples --prefix examples` | Run the demonstration with section descriptions and detailed operation logs. |
| `npm run test:package` | Test an installed tarball, including compiling and executing the README snippets. |
| `npm run typecheck:5.7` | Verify library declarations and inference checks with the minimum compiler. |

Each file under `examples/src/examples` contains a complete runnable use case, including its fixtures, application functions, and logging. The standalone package tests do not replace tarball validation: local files can work even if a published file is missing.
