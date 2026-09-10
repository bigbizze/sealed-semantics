# Application examples

Run `npm run examples` from `examples/consumer`. [index.ts](index.ts) keeps the important operations visible. [../runners.ts](../runners.ts) supplies fixtures, logging, and result checks. The fake server and database adapters do not make network calls or persist data.

## Require a validated batch before writing

Read [membership-workflow.ts](define-minted/membership-workflow/membership-workflow.ts), starting with `saveMembershipBatch`. Its first argument must be a `MembershipBatch`; a matching object shape is insufficient.

Section 5 of the index shows how to obtain that argument:

1. `UserId` and `ProjectId` parse external strings into distinct semantic types.
2. `PreparedMembership.mint({ userId, projectId })` requires both IDs and checks their runtime brands.
3. [MembershipBatch.mint](define-minted/membership-workflow/membership-batch.ts) accepts the plans, rejects an empty list or mixed projects, and keeps the first plan for each user.
4. `saveMembershipBatch(batch, database)` accepts the resulting sealed batch and encodes its children for the database adapter.

A batch therefore follows both producer steps: each plan was accepted, then the collection was accepted. The producer implements these rules. The library restricts construction and keeps the result private. The save function checks the brand as well, so JavaScript and `any` cannot substitute a matching plain object.

The array is copied during preparation and again when exposed through `view.plans`. The sealed child values can be shared. Authorization, transactions, and database constraints remain responsibilities of the application and adapter.

## Decode an HTTP request and encode a response

[http-contract.ts](define-value/http-contract.ts) provides a fake `POST /memberships/preview` handler. It reads JSON, validates IDs, calls a function that accepts the specific sealed types, and returns encoded JSON.

Section 1 uses both `z.safeDecode(postResponseSchema, responseBody)` and individual `Kind.codec.parse()` calls. A schema is usually more convenient for complete requests and responses: it validates the structure and decodes nested sealed values in one operation. Individual parsing is useful when only one property needs decoding.

Section 2 shows why separately parsed objects can be unequal under `===` but equal under `.equals()`. It also encodes the full schema back to raw data. Section 3 compares ordinary parse results with exceptions and HTTP errors.

## Reuse a cached profile

[profile-cache.ts](define-value/profile-cache.ts) accepts a database lookup function and returns a cached lookup. `UserId.map` treats a legacy spelling and the current spelling as the same key after normalization. Section 4 makes four sequential lookups for two users and logs two database reads.

Tests and compile-time checks live in [../../test/examples.test.ts](../../test/examples.test.ts). The index keeps the calls being demonstrated visible; runners contain the detailed output and demonstration assertions.
