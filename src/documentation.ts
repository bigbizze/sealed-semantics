import { validateDocumentation } from './docs.js';
import type { AnyKind } from './types.js';
export type DocumentationShape = Readonly<{
  semantic: boolean;
  view: readonly string[];
  copy: readonly string[];
}>;
type MemberDocs = Readonly<
  Record<string, { readonly description: string; readonly example?: unknown }>
>;
export type Metadata = {
  readonly copy?: MemberDocs;
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
    for (const namespace of ['view', 'copy'] as const) {
      const members = metadata[namespace];
      if (members !== undefined)
        documentation[namespace] = Object.freeze(
          Object.fromEntries(
            Object.entries(members).map(([name, entry]) => [
              name,
              Object.freeze({ ...entry }),
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
