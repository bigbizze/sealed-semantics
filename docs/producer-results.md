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

Minted construction uses the structural `ProducerResult<T, E = ValueError>` contract:

```ts
{ ok: true, value: parts }
{ ok: false, error: { kind: 'app/plan', reason: 'invalid_input', issues: ['Missing input'] } }
```

`Kind.mint(input)` returns failure unchanged and seals successful Parts. Runtime `ok` and `err` helpers are not exported. Producers may use any helper that returns the structural contract. There is no global result adapter, `unwrap`, or `mintOrThrow` API.

Semantic identity collisions and unsupported Parts are producer errors and throw TypeError, including through safe Zod operations. Foreign-definition encoding produces a Zod issue naming the operation, receiving kind, and likely cause. Safe encoding returns that issue; ordinary encoding throws.
