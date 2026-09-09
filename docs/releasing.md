# Preparing a release

This repository builds an ESM npm package with declaration files. The package exports the main API and the separate Node-only law harness. Internal modules are blocked by the package export map. The `check-kinds` executable is included. The main import requires only the Zod peer; users of the law harness install fast-check as a dev dependency.

1. Run `npm ci` and `npm run check`.
2. Run `npm run test:package` for the minimum Zod version, then `npm run test:package -- 4` for current Zod 4.
3. Run `npm exec --package=typescript@5.7.3 -- tsc --noEmit` to check the minimum TypeScript version.
4. Inspect `npm pack --dry-run`. `npm pack` runs the checks through prepack and creates `canonical-type-0.1.0.tgz` for the current version.
5. Share the tarball directly with `npm install /path/to/canonical-type-0.1.0.tgz`, or publish with `npm publish --access public` from an authorized npm account after choosing the final version and package name.

No npm publication, remote repository, or release tag is created by these checks. An npm registry lookup returned 404 for `canonical-type` during preparation; this does not reserve the name. Add the actual repository URL, homepage, and issue tracker when a remote exists. Do not invent these metadata fields.

The package smoke test installs the real tarball in a temporary consumer. It compiles and runs the README, checks invalid consumer configurations against the emitted declarations, imports the test-only harness, tests collections across two physical package copies, confirms private subpaths cannot be imported, and runs the shipped CLI. Temporary consumer files are removed; the tarball remains in the repository directory.

The checked-in CI configuration repeats checks on Node 22 and 24 with Zod 4.1.0 and current Zod 4. Local evidence does not imply that hosted CI has run. Breaking kind renames and canonical/wire changes need release notes and consumer compatibility review. Keep compatibility vectors with protocol owners.
