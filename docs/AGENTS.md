# Agent instructions for sealed-semantics

Paste this block into the consuming repository's `AGENTS.md` or `CLAUDE.md`.

## sealed-semantics

On `Proof<"x">`/`SealedValue` errors: casts, `any`, and fake brands won't help. Grep `"x"` → its `defineSeal`/`defineMint`. Build via `.codec.parse()`/`z.decode`/`.mint()`; read via `.view`/`.copy`. `{ ok: false }` from `.mint()` is a real rejection; fix input or report, don't bypass. Runtime errors give `Defined at file:line`.
