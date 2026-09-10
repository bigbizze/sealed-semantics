import type { z } from 'zod';
import { validateDefinition, validateView } from './definition.js';
import { documentedKind, type Metadata } from './documentation.js';
import { makeSeal } from './seal.js';
import { makeWireCodec, encodeWire, parseCodec } from './zod-codec.js';
import { stableWireKey } from './keying.js';
import type {
  ProducerResult,
  JsonSchema,
  LiteralKind,
  ConfigurationError,
  AnyKind,
  ValueBuilder,
  MintedBuilder,
} from './types.js';
export type {
  ProducerResult,
  ValueError,
  ValueOf,
  JsonValue,
  AnyKind,
  ValueDocumentation,
  ValueExample,
  ProjectionDocumentation,
  MintedDocumentation,
} from './types.js';
import { ValueMap, ValueSet } from './collections.js';
export type { ValueMap, ValueSet } from './collections.js';
const ok = <T>(value: T): ProducerResult<T, never> => ({ ok: true, value });
import { register } from './registry.js';
function collections<K extends AnyKind>(kind: K) {
  return { map: <V>() => new ValueMap<K, V>(kind), set: () => new ValueSet(kind) };
}
// Each builder captures its configuration. Only seal creates and registers a kind.
function builder(
  complete: (
    view: Record<string, (parts: any) => unknown>,
    metadata?: Metadata,
  ) => object,
  view: Record<string, (parts: any) => unknown> = {},
  metadata?: Metadata,
): object {
  let completed: object | undefined;
  let sealing = false;
  return Object.freeze({
    view: (projections: Record<string, (parts: any) => unknown>) => {
      if (metadata !== undefined)
        throw new TypeError('Configure .view() before .docs().');
      validateView(projections);
      return builder(complete, Object.freeze({ ...projections }));
    },
    docs: (next: Metadata) => {
      if (next === undefined) throw new TypeError('Documentation must be an object');
      return builder(complete, view, next);
    },
    seal: () => {
      if (completed) return completed;
      if (sealing)
        throw new TypeError(
          'Cannot call .seal() recursively while completing a definition',
        );
      sealing = true;
      try {
        completed = complete(view, metadata);
        return completed;
      } finally {
        sealing = false;
      }
    },
  });
}
export function defineKind<
  const K extends string,
  W extends z.ZodType,
  A extends unknown[] = never,
  const Keys extends PropertyKey = never,
>(
  spec: {
    kind: LiteralKind<K>;
    schema: W & JsonSchema<W>;
    allocate?: (...args: A) => NoInfer<z.input<W>>;
    equals?: (a: NoInfer<z.output<W>>, b: NoInfer<z.output<W>>) => boolean;
    debug?: (parts: NoInfer<z.output<W>>) => string;
  } & Record<Keys, unknown> & {
      [
        N in Exclude<Keys, 'kind' | 'schema' | 'allocate' | 'equals' | 'debug'>
      ]: ConfigurationError<
        N extends 'decode' | 'encode' | 'canonical'
          ? 'Configure conversion in a Zod codec passed as schema. Expose observations with .view(...).'
          : N extends string
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
  const { kind, schema, equals, debug, allocate } = spec;
  return builder((view, metadata) => {
    const bridge = makeSeal<z.output<W>>(kind, {
      semantic: true,
      debug,
      view,
      equals:
        equals ??
        ((a, b) =>
          stableWireKey(encodeWire(schema, a)) ===
          stableWireKey(encodeWire(schema, b))),
    });
    const codec = makeWireCodec(schema, kind, bridge.seal, bridge.is, bridge.read);
    const result = { kind, is: bridge.is, codec };
    if (allocate)
      Object.assign(result, {
        allocate: (...args: A) => parseCodec(codec, allocate(...args)),
      });
    Object.assign(result, collections(result as unknown as AnyKind));
    const completed = documentedKind(
      result,
      { semantic: true, view: Object.keys(view) },
      metadata,
    );
    register(kind);
    return completed;
  }) as ValueBuilder<
    K,
    W,
    z.output<W>,
    [A] extends [never] ? {} : { allocate: (...args: A) => unknown }
  >;
}
/**
 * Creates a builder for values whose configured mint producer must succeed.
 * Establishes the construction path, not producer correctness or external facts.
 */
export function defineMinted<
  const K extends string,
  I,
  P,
  const Keys extends PropertyKey = never,
>(
  spec: {
    kind: LiteralKind<K>;
    mint: (input: I) => ProducerResult<P>;
    debug?: (parts: NoInfer<P>) => string;
  } & Record<Keys, unknown> & {
      [N in Exclude<Keys, 'kind' | 'mint' | 'debug'>]: ConfigurationError<
        N extends 'allocate' | 'equals' | 'schema'
          ? `Minted definitions cannot configure ${N}. Only semantic definitions support this option.`
          : N extends string
            ? `Unknown definition option "${N}". Use .view(...) for projections and .docs(...) for documentation.`
            : 'Symbol-named options are not supported.'
      >;
    },
): MintedBuilder<K, I, P> {
  validateDefinition(spec, false);
  const { kind, mint, debug } = spec;
  return builder((view, metadata) => {
    const bridge = makeSeal<P>(kind, { debug, view });
    const result = {
      kind,
      is: bridge.is,
      mint: (input: I) => {
        const produced = mint(input);
        return produced.ok ? ok(bridge.seal(produced.value)) : produced;
      },
    };
    Object.assign(result, collections(result as unknown as AnyKind));
    const completed = documentedKind(
      result,
      {
        semantic: false,
        view: Object.keys(view),
      },
      metadata,
    );
    register(kind);
    return completed;
  }) as MintedBuilder<K, I, P>;
}
