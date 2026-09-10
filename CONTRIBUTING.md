# Contributing

Open an issue to discuss a behavior change or submit a pull request with a focused change. Include the problem, the resulting behavior, and the checks you ran.

## Local setup

Use Node 22 or 24. From the repository root:

```sh
npm ci
npm run check
npm run typecheck:5.7
npm run test:package
```

`npm run check` formats nothing: it checks formatting, types, library tests, the README, and the consumer tests and demonstration. Use `npm run format` to format TypeScript and scripts. Package smoke tests compile and execute the README against an installed tarball. Use `npm run test:package -- 4` to test current Zod 4 as well as the minimum 4.1.0.

## Where changes belong

- `src`: library runtime and public types. Runtime Zod operations belong in `zod-codec.ts`.
- `test` and `spike`: runtime checks, compiler diagnostics, completion checks, and inference checks.
- `examples`: a separate consumer package with practical examples and its own tests.
- `docs`: current guarantees, API guidance, and framework guidance.

When changing public types, test both accepted inference and rejected configurations. Invalid capabilities should not appear as available operations. When changing a producer example, verify its exact projection types as well as its runtime behavior.

Keep the producer's rules separate from the library's construction guarantees. Do not expose private Parts or introduce mutable aliases. Use `===` for identity, and explicit encoding at representation boundaries. Each completed definition has its own runtime identity, even when labels match.

Update documentation and executable examples with behavior changes. Avoid generated output, local archives, IDE configuration, credentials, and unrelated edits in pull requests. The project uses the MIT license; contributions are made under that license.
