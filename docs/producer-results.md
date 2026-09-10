# Boundary and mint errors

Zod handles semantic boundary errors:

```ts
const result = UserId.codec.safeParse(input);
if (result.success) {
  useUser(result.data);
} else {
  console.log(result.error.issues);
}
```

`Kind.codec.parse(input)` throws `ZodError` for validation failures. `z.decode` and `z.encode` require statically typed arguments; their safe forms return Zod's result shape. Use the enclosing contract schema for complete requests and responses. Optional allocation parses its generated input through the codec and returns a value or throws a Zod error.

There is no separate library parse result, parse wrapper, or instance encoder. Put conversion and rejection logic in the Zod schema or codec. Zod issues preserve paths within nested contracts. Programming exceptions thrown by callbacks are not converted into validation failures.

Minted construction uses `ProducerResult<Parts, Error>`. Both types are inferred from the producer. The error type belongs to the application. For an infallible producer, the error defaults to `never`.

```ts
type PaymentError =
  | { code: 'unauthorized' }
  | { code: 'expired'; expiredAt: Date };

const Payment = defineMint({
  name: 'payment/authorized',
  mint: (input: string): ProducerResult<{ input: string }, PaymentError> =>
    input
      ? { ok: true, value: { input } }
      : { ok: false, error: { code: 'unauthorized' } },
}).seal();
const result = Payment.mint('');
if (!result.ok) console.log(result.error.code); // PaymentError
```

The completed kind returns the producer's failure unchanged. It does not wrap errors, add properties, or convert them into messages. Object unions, string errors, and other producer-owned values are supported. Successful mint calls still create distinct instances. Minted values have no serialization API in the current API.

Semantic identity collisions and unsupported Parts are producer errors and throw TypeError, including through safe Zod operations. Foreign-definition encoding produces a Zod issue naming the operation, receiving kind, and likely cause. Safe encoding returns that issue; ordinary encoding throws.
