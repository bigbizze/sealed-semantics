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

Input rejection remains explicit. A failed wire schema produces `invalid_wire`. A producer failure preserves its `ValueError` object through `parse` or `derive`; the Zod codec converts producer rejection into a custom issue. Thrown producer exceptions remain programming errors. No exception-based acquisition or generic error mapping was added.
