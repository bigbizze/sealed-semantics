# Configuration diagnostics

The ordinary public types contain only supported capabilities. Generic checks attach `ConfigurationError<"explanation">` to invalid keys supplied by a caller. This keeps autocomplete accurate while making errors more useful than `never`.

- An unfinished `ValueOf<typeof builder>` asks the caller to call `.seal()`.
- Definition-level `decode`, `encode`, or `canonical` asks the caller to put conversion in a Zod codec and observations in `.view(...)`.
- Missing or invalid schemas, widened kind names, and non-JSON schema input are rejected.
- Documentation requires typed input/output examples, exact view names, and descriptions. Canonical examples are rejected.
- Law options expose allocation generators only when an allocator exists, and projection mutators only for declared views.

Reserved projection names and symbol projections are rejected at compile time and runtime. Runtime declaration checks reject unknown keys, accessors, hidden properties, symbols, and malformed callbacks before registration. JavaScript callers get runtime errors even if they bypass the TypeScript checks.

Boundary validation belongs to Zod. Use `Kind.codec.safeParse` to inspect Zod issues or `Kind.codec.parse` to throw. The library does not provide an alternative parsing API.
