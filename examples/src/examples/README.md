# Application examples

Each file contains a complete runnable example. Run all of them with `npm run examples` from `examples/`, or build once and run a single file with `node dist/examples/<name>.js`.

- [http-contract.ts](http-contract.ts): read a JSON request, decode semantic IDs, call typed application code, and encode a response. Compare whole-schema and individual-field parsing, then handle invalid input.
- [profile-cache.ts](profile-cache.ts): perform four lookups for two users. A native Map uses normalized semantic identity, so aliases share a cached profile.
- [membership-workflow.ts](membership-workflow.ts): define and mint a membership plan, then define and mint a non-empty batch for one project. Save the batch through a typed function, reject bad requests before writing, and run a complete add-members request.

The membership example contains both mint definitions and all request/save functions. Only the shared UserId and ProjectId definitions are imported. Each plan must pass its producer; the batch must then pass its own producer. The save function trusts that typed input. Authorization, transactions, and database constraints remain application responsibilities.

The examples use fake servers and database adapters. Tests live in [../../test](../../test); importing example functions does not run their demonstrations.
