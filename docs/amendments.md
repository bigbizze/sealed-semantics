# API amendments

The [current specification](specification.md) replaces the original revision-5 API.

- `defineKind({ kind, schema })` uses the schema output as private Parts. Put conversions in a Zod codec.
- Zod is the semantic boundary API. Removed library parsing methods, definition conversion callbacks, instance encoding, and canonical operations have no aliases.
- `defineMinted({ kind, mint })` replaces the derived construction family. It provides evidence that the configured producer succeeded.
- Optional `.view(...)` declares read-only projection properties. Optional `.docs(...)` follows it. Required `.seal()` completes the kind.
- Instances, prototypes, builders, kinds, and view facades are frozen. Parts remain producer-owned private state.
- A realm-wide registry rejects duplicate completed names across package copies. No executable scanner is shipped.
- Documentation validates linked `input` and `encoded` examples during sealing. No docs CLI is shipped.
- Property laws use Zod codecs and explicit mutators for custom, function, or accessor projections. Fast-check is an optional test peer.

See [release notes](releasing.md) for migration from the published API.
