# Agent instructions for sealed-semantics

Paste this block into the consuming repository's `AGENTS.md` or `CLAUDE.md`.

## sealed-semantics

On `Proof<"x">` errors: do not cast. Grep `"x"` → `defineSeal`/`defineMint`.
Construct via `.codec.parse()` / `z.decode` / `.mint()`.
Observe via `Kind.read(value)` or `Kind.<projection>(value)`.
Copy bytes via `Kind.<copyName>(value)`.
`{ ok: false }` from `.mint()` is a real rejection; do not bypass.
