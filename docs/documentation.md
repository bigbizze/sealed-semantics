# Executable documentation

Add `.docs(...)` after optional `.view(...)` and before `.seal()`. Documentation is optional. When present, it is checked synchronously at sealing, including during module initialization.

```ts
const UserId = defineKind({
  key: parts => parts,
  kind: 'app/user-id',
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

`description` is optional. If projections exist, `view` must document exactly the declared names. Each needs a non-empty description; its example is optional and typed as the projection output. Projection examples are descriptive samples and are not linked to a particular codec example. Minted docs cannot contain wire examples and do not execute `mint`.

Completed kinds expose the frozen metadata as `Kind.documentation`. Metadata containers are frozen; example value graphs remain caller-owned. Documentation does not alter later parsing or encoding. There is no docs CLI or public discovery runner. Modules must execute for their documentation to be checked.

Factory metadata cannot generate genuine JSDoc comments for TypeScript hovers. Add JSDoc at declaration sites. Tooling could consume the metadata to generate documentation or declarations later.

Sealing also evaluates declared views for each semantic input example. This checks their runtime output domain. A projection description sample is illustrative metadata, not a linked assertion for every input. Minted docs do not run the mint producer. First-access view validation always remains active.
