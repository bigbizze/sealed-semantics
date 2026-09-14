# Release notes

## 0.4.2

- `Proof<Name>` now prints a default type argument in compiler errors: do not cast, grep the definition name, and construct through `.codec.parse()` or `.mint()`. `ValueOf<typeof Kind>` still displays as `Proof<...>` for ordinary seals.
- `defineSeal` and `defineMint` capture the caller `file:line` once at definition time. Runtime errors that name a definition include that path and tell the caller to search for the exact name string. Node inspection shows `Sealed<kind> defined at file:line`.
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
