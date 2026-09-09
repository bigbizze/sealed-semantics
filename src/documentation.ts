type Metadata = {
  readonly description?: string;
  readonly exampleWire?: unknown;
  readonly exampleCanonical?: unknown;
  readonly view?: Readonly<
    Record<string, { readonly description?: string; readonly example?: unknown }>
  >;
};

// Copy documentation containers only. Examples remain author-owned values;
// neither their schemas nor producer callbacks run during this stage.
export function documentedKind<T extends object>(kind: T, metadata?: Metadata): object {
  const result = { ...kind, docs: (next: Metadata) => documentedKind(kind, next) };
  if (metadata !== undefined) {
    const documentation = { ...metadata };
    if (metadata.view !== undefined) {
      documentation.view = Object.freeze(
        Object.fromEntries(
          Object.entries(metadata.view).map(([name, view]) => [
            name,
            Object.freeze({ ...view }),
          ]),
        ),
      );
    }
    Object.defineProperty(result, 'documentation', {
      value: Object.freeze(documentation),
      enumerable: true,
    });
  }
  return Object.freeze(result);
}
