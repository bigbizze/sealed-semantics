import type { z } from 'zod';
import { validateDefinition, validateView, validateConversions } from './definition.js';
import { documentedKind, type Metadata } from './documentation.js';
import { makeSemanticSeal, makeMintedSeal } from './seal.js';
import { makeWireCodec, parseCodec } from './zod-codec.js';
import type {
  ProducerResult,
  JsonSchema,
  LiteralName,
  ConfigurationError,
  IdentityOptions,
  ValueBuilder,
  MintedBuilder,
} from './types.js';
export type {
  ProducerResult,
  DeepReadonly,
  Owned,
  ValueOf,
  JsonValue,
  AnyKind,
  ValueDocumentation,
  ValueExample,
  ProjectionDocumentation,
  MintedDocumentation,
} from './types.js';
const ok = <T>(value: T): ProducerResult<T, never> => ({ ok: true, value });
// Each builder captures its configuration. Sealing creates a definition instance.
function builder(
  complete: (
    view: Record<string, (parts: any) => unknown>,
    metadata: Metadata | undefined,
    conversions: Record<string, (parts: any) => unknown>,
  ) => object,
  view: Record<string, (parts: any) => unknown> = {},
  metadata?: Metadata,
  conversions: Record<string, (parts: any) => unknown> = {},
): object {
  let sealing = false;
  return Object.freeze({
    view: (projections: Record<string, (parts: any) => unknown>) => {
      validateView(projections);
      return builder(
        complete,
        Object.freeze({ ...projections }),
        metadata,
        conversions,
      );
    },
    to: (next: Record<string, (parts: any) => unknown>) => {
      validateConversions(next);
      return builder(complete, view, metadata, Object.freeze({ ...next }));
    },
    docs: (next: Metadata) => {
      if (next === undefined) throw new TypeError('Documentation must be an object');
      return builder(complete, view, next, conversions);
    },
    seal: () => {
      if (sealing)
        throw new TypeError(
          'Cannot call .seal() recursively while completing a definition',
        );
      sealing = true;
      try {
        return complete(view, metadata, conversions);
      } finally {
        sealing = false;
      }
    },
  });
}
/**
 * Completes semantic values whose identity is reference identity within one definition.
 * The definition name is a label. Same-label definitions are unrelated at runtime.
 */
export function defineSeal<
  const K extends string,
  W extends z.ZodType,
  A extends unknown[] = never,
  const Keys extends PropertyKey = never,
>(
  spec: {
    name: LiteralName<K>;
    schema: W & JsonSchema<W>;
    allocate?: (...args: A) => NoInfer<z.input<W>>;
    debug?: (parts: NoInfer<z.output<W>>) => string;
  } & IdentityOptions<NoInfer<z.output<W>>> &
    Record<Keys, unknown> & {
      [
        N in Exclude<Keys, 'name' | 'schema' | 'allocate' | 'debug' | 'key'>
      ]: ConfigurationError<
        N extends string
          ? `Unknown definition option "${N}". Use .view(...) for projections and .docs(...) for documentation.`
          : 'Symbol-named options are not supported.'
      >;
    },
): ValueBuilder<
  K,
  W,
  z.output<W>,
  [A] extends [never] ? {} : { allocate: (...args: A) => unknown }
> {
  validateDefinition(spec, true);
  const { name, schema, debug, allocate, key } = spec;
  return builder((view, metadata, to) => {
    const bridge = makeSemanticSeal<z.output<W>>(name, { debug, view, key, to });
    const codec = makeWireCodec(schema, name, bridge.seal, bridge.is, bridge.read);
    const result = { name, is: bridge.is, codec };
    if (allocate)
      Object.assign(result, {
        allocate: (...args: A) => parseCodec(codec, allocate(...args)),
      });
    const completed = documentedKind(
      result,
      { semantic: true, view: Object.keys(view), to: Object.keys(to) },
      metadata,
    );
    return completed;
  }) as ValueBuilder<
    K,
    W,
    z.output<W>,
    [A] extends [never] ? {} : { allocate: (...args: A) => unknown }
  >;
}
type MintParts<R> = R extends { ok: true; value: infer P } ? P : never;
type MintError<R> = R extends { ok: false; error: infer E } ? E : never;
/**
 * Creates a builder for values whose configured mint producer must succeed.
 * Each successful mint is a distinct event owned by this definition instance.
 * Same-label definitions are unrelated. Establishes construction, not external facts.
 */
export function defineMint<
  const K extends string,
  I,
  R extends ProducerResult<unknown, unknown>,
  const Keys extends PropertyKey = never,
>(
  spec: {
    name: LiteralName<K>;
    mint: (input: I) => R;
    debug?: (parts: NoInfer<MintParts<R>>) => string;
  } & Record<Keys, unknown> & {
      [N in Exclude<Keys, 'name' | 'mint' | 'debug'>]: ConfigurationError<
        N extends 'allocate' | 'key' | 'schema'
          ? `Minted definitions cannot configure ${N}. Only semantic definitions support this option.`
          : N extends string
            ? `Unknown definition option "${N}". Use .view(...) for projections and .docs(...) for documentation.`
            : 'Symbol-named options are not supported.'
      >;
    },
): MintedBuilder<K, I, MintParts<R>, MintError<R>> {
  validateDefinition(spec, false);
  const { name, mint, debug } = spec;
  return builder((view, metadata, to) => {
    const bridge = makeMintedSeal<MintParts<R>>(name, { debug, view, to });
    const result = {
      name,
      is: bridge.is,
      mint: (input: I) => {
        const produced = mint(input);
        return produced.ok ? ok(bridge.seal(produced.value as MintParts<R>)) : produced;
      },
    };
    const completed = documentedKind(
      result,
      {
        semantic: false,
        view: Object.keys(view),
        to: Object.keys(to),
      },
      metadata,
    );
    return completed;
  }) as MintedBuilder<K, I, MintParts<R>, MintError<R>>;
}
