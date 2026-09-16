# Agent instructions for sealed-semantics

Paste this block into the consuming repository's `AGENTS.md` or `CLAUDE.md`.

## sealed-semantics

On `Proof<"x">` errors: do not cast. Grep `"x"` → `defineSeal`/`defineMint`.
Construct via `.codec.parse()` / `z.decode` / `.mint()`.
`Kind.is` / `Kind.assert` accept `unknown` and authenticate.
Observe via `Kind.read(value)` / `Kind.<name>(value)` — those require that kind's instance, not `unknown` or another kind.
Copy bytes via `Kind.<copyName>(value)`.
Nested sealed inputs: `OtherKind.assert(input.child)` in a mint or key; do not trust structure.
`{ ok: false }` from `.mint()` is a real rejection; do not bypass.
