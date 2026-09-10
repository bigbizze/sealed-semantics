import { validateDocumentation } from './docs.js';
import type { AnyKind } from './types.js';
export type DocumentationShape = Readonly<{
  semantic: boolean;
  view: readonly string[];
}>;
export type Metadata = {
  readonly description?: string;
  readonly examples?: readonly {
    readonly input: unknown;
    readonly encoded: unknown;
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
// Validate before copying metadata containers; sample graphs remain producer-owned.
export function documentedKind<T extends object>(
  kind: T,
  shape: DocumentationShape,
  metadata?: Metadata,
): object {
  const result = { ...kind };
  if (metadata !== undefined) {
    validateDocumentation(
      { ...kind, documentation: metadata } as unknown as AnyKind,
      shape,
    );
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
  return Object.freeze(result);
}
