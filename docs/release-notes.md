# Release notes

## 0.5.0

- Breaking: observation is kind-side. `user.view.suffix`, `digest.copy.bytes()`, and `value.debug()` are removed from the public instance surface. Use `UserId.suffix(user)`, `UserId.read(user)`, `Digest.bytes(digest)`, and `UserId.debug(user)`. Each call unseals first.
- `Kind.assert(value)` unseals and returns the same instance. Projection and copy names are reserved against `assert`, `read`, `debug`, and `name`.
- A duck-typed `{ view }` object plus `as UserId` no longer yields forged data through a typed sink that observes via the kind.
- README and examples must not use instance `.view.` access. Builder `.view({` remains.

## 0.4.2

- `Proof<Name>` now prints a default type argument in compiler errors: do not cast, grep the definition name, and construct through `.codec.parse()` or `.mint()`. `ValueOf<typeof Kind>` still displays as `Proof<...>` for ordinary seals.
- Runtime errors that name a definition tell the caller to search for that exact name string in every environment. In development, `defineSeal` and `defineMint` also capture a relative `Defined at file:line` when `NODE_ENV` is not `production`, the runtime is Node, Bun, or Deno, and the stack frame is a source file under the working directory. Node inspection shows the same pointer when it is available. Consumers asserting exact error text may need to update.
- A consumer wrapper that calls `defineSeal` or `defineMint` captures the wrapper's location; the search suffix remains correct because it uses the definition name.
- The package includes [agent instructions](AGENTS.md) for consumers to paste into `AGENTS.md` or `CLAUDE.md`.

## 0.4.1

- Plain-object snapshots now use canonical property order before any callback receives them. JavaScript array-index keys are ordered numerically, then other string keys are ordered lexically by UTF-16 code unit.
- Semantic Parts, successful mint Parts, and view results all use that canonical order. Encoders that iterate, spread, or otherwise preserve Parts property order can therefore produce a different encoded property order.
- Collision checks now compare one-to-one alias topology. Shared children and duplicated children with the same field values are different semantic Parts when callbacks can observe their reference equality.
- Snapshotting now uses measured hot-path optimizations for ordinary objects and arrays. Descriptor reads and per-property definition dominated before the first optimization. Comparator-based canonical sorting then became the largest avoidable `snapshotData` cost for plain objects; the final path partitions keys before sorting.
- Collision behavior can change for definitions whose key groups values that differ only by property insertion order or alias topology.
- Model identifiers and small canonical values as seals. Keep large records as ordinary Zod output that contains sealed leaves. A 500-property record is usually data, not identity.
- Zod schema encoders must still treat Parts as readonly. TypeScript cannot express that limitation through the external Zod codec type, so runtime freezing remains authoritative.
- Sealed values still do not support implicit `JSON.stringify`. Only explicit Zod encoding defines external representation.
