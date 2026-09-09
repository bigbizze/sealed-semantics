export type DocumentationShape = Readonly<{
  semantic: boolean;
  canonical: boolean;
  view: readonly string[];
}>;
export type Metadata = {
  readonly description?: string;
  readonly examples?: readonly {
    readonly input: unknown;
    readonly encoded: unknown;
    readonly canonical?: unknown;
  }[];
  readonly view?: Readonly<
    Record<
      string,
      {
        readonly description: string;
        readonly example?: unknown;
      }
    >
  >;
};
// Test-only inspection data. This map cannot enumerate kinds or change their behavior.
const shapes = new WeakMap<object, DocumentationShape>();
export const documentationShape = (kind: object): DocumentationShape | undefined =>
  shapes.get(kind);

// Copy and freeze metadata containers, without validating or freezing sample graphs.
export function documentedKind<T extends object>(
  kind: T,
  shape: DocumentationShape,
  metadata?: Metadata,
): object {
  const result = {
    ...kind,
    docs: (next: Metadata) => documentedKind(kind, shape, next),
  };
  if (metadata !== undefined) {
    const documentation = { ...metadata };
    if (metadata.examples !== undefined) {
      documentation.examples = Object.freeze(
        metadata.examples.map((example) => Object.freeze({ ...example })),
      );
    }
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
  shapes.set(result, Object.freeze({ ...shape, view: Object.freeze([...shape.view]) }));
  return Object.freeze(result);
}
