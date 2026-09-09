# Producer results

The package exports a structural TypeScript contract, not a result utility API:

```ts
import type { ProducerResult, ValueError } from 'sealed-semantics';

type Example<T, E = ValueError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
```

`ProducerResult<T, E = ValueError>` has that shape. `decode` and `derive` synchronously return `ProducerResult<Parts>`; `parse`, `allocate`, and `Kind.derive` return the same shape containing the sealed value. The error for these operations must satisfy `ValueError`. The generic error parameter helps consumers describe compatible helpers; it does not configure arbitrary producer errors.

A producer can return objects directly, with contextual inference:

```ts
import { defineValue } from 'sealed-semantics';
import { z } from 'zod';

const Label = defineValue({
  kind: 'example/label',
  wire: z.string(),
  decode: spelling => spelling.length > 0
    ? { ok: true, value: { spelling } }
    : { ok: false, error: {
        kind: 'example/label', reason: 'invalid_parts', issues: ['Empty label'],
      } },
}).with({ toWireShape: parts => parts.spelling });
```

Consumers can instead use their own helpers or a result implementation with compatible `ok`, `value`, and `error` properties. A separately declared helper must preserve the literal discriminant, for example `const succeed = <T>(value: T) => ({ ok: true as const, value })`. A promise, deferred computation, or result with a different discriminant is not compatible automatically. There is no global configuration or per-definition adapter.

The package does not export runtime `ok` or `err` helpers, and the old `Result` type name is removed. The only runtime exports from the main entry are `defineValue` and `defineDerived`. Helpers in tests and reference examples belong to those callers.

Input rejection remains explicit. A failed wire schema produces `invalid_wire`. A producer failure preserves its `ValueError` object through `parse` or `derive`; the Zod codec converts producer rejection into a custom issue. Thrown producer exceptions remain programming errors. Producer exceptions also propagate unchanged through `parseOrThrow`.


For exception-based callers, `Kind.parseOrThrow(input)` returns the exact sealed value type directly. It calls the same acquisition path as `parse()` once. On a rejected input it throws a `TypeError`; the message contains the error kind, reason, and issues, and `cause` holds the original `ValueError`. It is available on semantic kinds only, including documented kinds. Results remain plain objects without an `unwrap()` method.

```ts
const label = Label.parseOrThrow('hello');
```

## Choosing a boundary API

| Need | Operation | Failure |
| --- | --- | --- |
| Inspect a single value's rejection | `Kind.parse(input)` | `{ ok: false, error }` |
| Stop the operation on invalid input | `Kind.parseOrThrow(input)` | Throws `TypeError` with `ValueError` as cause |
| Decode a complete request or response | `schema.parse(body)` or `z.decode(schema, body)` | Throws a Zod error for validation rejection |
| Inspect whole-object validation failure | `schema.safeParse(body)` or `z.safeDecode(schema, body)` | `{ success: false, error }` |
| Produce a checked local value | `Kind.derive(input)` | `{ ok: false, error }` |

Build complete schemas with properties such as `user_id: UserId.wire`. One decode then validates the object structure and supplies the sealed property types, including nested arrays and objects. `z.encode(schema, value)` converts the complete result back to raw data. This reduces repetitive manual parsing and makes boundary validation easier to adopt.

`await response.json()` reads JSON but does not validate its shape. When manually parsing fields, each `parseOrThrow` validates only that field. Do not annotate raw JSON as the decoded type before validating it. The [consumer index](../examples/consumer/src/examples/index.ts) demonstrates both approaches and compares their outputs with `.equals()`.
