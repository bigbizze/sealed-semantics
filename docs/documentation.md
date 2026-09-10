# Executable documentation

Call `.docs(...)`, `.view(...)`, and `.copy(...)` in any order, then call `.seal()` last. Completed definitions have no builder methods. Documentation is optional. When present, it is checked synchronously at sealing, including during module initialization.

```ts
const UserId = defineSeal({
  key: parts => parts,
  name: 'app/user-id',
  schema: z.string().toLowerCase().regex(/^usr_[a-f0-9]+$/),
})
  .view({ suffix: id => id.slice(-6) })
  .docs({
    description: 'A normalized user identifier.',
    examples: [{ input: 'USR_ABCDEF', encoded: 'usr_abcdef' }],
    view: {
      suffix: { description: 'The final six characters.', example: 'abcdef' },
    },
  })
  .seal();
```

Each semantic example requires `input` and `encoded`, both typed as the schema's input type. The examples array must be non-empty. Runtime validation catches restrictions TypeScript cannot express, such as a regex. The check parses through the codec, compares the actual encoding, parses that encoding again, and verifies reference identity and stable output. A bad example throws during sealing.

`description` is optional. If projections exist, `view` must document exactly the declared names. Each needs a non-empty description; its example is optional and typed as the projection output. When docs come first, projection sample types and exact names are checked against the final view at `.seal()`. Missing or mismatched documentation is a compile error and is also rejected at runtime. Projection examples are descriptive samples and are not linked to a particular codec example. Minted docs cannot contain wire examples and do not execute `mint`.

Completed kinds expose the frozen metadata as `Kind.documentation`. Metadata containers are frozen; example value graphs remain caller-owned. Documentation does not alter later parsing or encoding. There is no docs CLI or public discovery runner. Modules must execute for their documentation to be checked.

Factory metadata cannot generate genuine JSDoc comments for TypeScript hovers. Add JSDoc at declaration sites. Tooling could consume the metadata to generate documentation or declarations later.

Sealing also evaluates declared views for each semantic input example. This checks their runtime output domain. A projection description sample is illustrative metadata, not a linked assertion for every input. Minted docs do not run the mint producer. First-access view validation always remains active.

If copy observations exist, `copy` must document exactly their names, each with a non-empty `description` and optional Uint8Array `example`. As with views, `.seal()` checks the final names and sample types even when docs were supplied first. Semantic input examples exercise each copy observation, which can initialize its private snapshot during sealing. Minted docs do not execute the mint or copy producers. Copy samples are illustrative, not linked expected results for every input.
