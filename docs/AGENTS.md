# Agent instructions for sealed-semantics

Paste this block into the consuming repository's `AGENTS.md` or `CLAUDE.md`.

## Sealed values

When you see `Proof<...>`, `SealedValue<...>`, or an error mentioning sealed-semantics:

1. Do not cast, use `any`, add a missing brand property, or restructure the call to accept a string or a lookalike object. The type error is the construction boundary working as designed.
2. Read the name inside `Proof<"the/name">`. Search the codebase for that exact string. The name is written verbatim in the `defineSeal` or `defineMint` call; it often mirrors the module path, for example `kwa/semantic/NormalizedDeviceId` in `src/semantic/device-id.ts`.
3. Open that definition. Construct seals with `.codec.parse()` or `z.decode`, and mints with `.mint()`. Read observations through `.view` or `.copy`.
4. If `.mint()` returns `{ ok: false }`, that is a domain rejection from the producer. Fix the input or report a bug in the producer. Do not route around the mint.

Runtime errors name the same string and include `Defined at file:line` captured when `defineSeal` or `defineMint` ran. Use that path when present.

A codec or mint rejection is not a wall to silence. It tells you which definition owns the value.
