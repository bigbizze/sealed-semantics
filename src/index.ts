import type { z } from 'zod';
import { validateDefinition, validateView } from './definition.js';
import { documentedKind, type Metadata } from './documentation.js';
import { makeSeal } from './seal.js';
import { makeWireCodec, encodeWire, parseWire } from './zod-codec.js';
import { stableWireKey } from './keying.js';
import type {
  ProducerResult,
  JsonSchema,
  LiteralKind,
  ConfigurationError,
  AnyKind,
  ValueBuilder,
  DerivedBuilder,
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
  DerivedDocumentation,
} from './types.js';
import { ValueMap, ValueSet } from './collections.js';
export type { ValueMap, ValueSet } from './collections.js';
const ok = <T>(value: T): ProducerResult<T, never> => ({ ok: true, value });
const err = <E>(error: E): ProducerResult<never, E> => ({ ok: false, error });
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
declare const absentCanonical: unique symbol;
type AbsentCanonical = typeof absentCanonical;
type SameType<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Operations<C, A extends unknown[]> = (SameType<C, AbsentCanonical> extends true
  ? {}
  : { canonical: () => C }) &
  ([A] extends [never] ? {} : { allocate: (...args: A) => unknown });
export function defineKind<
  const K extends string,
  W extends z.ZodType,
  P,
  C = AbsentCanonical,
  A extends unknown[] = never,
  const Keys extends PropertyKey = never,
>(
  spec: {
    kind: LiteralKind<K>;
    schema: W & JsonSchema<W>;
    decode: (w: z.output<W>) => ProducerResult<P>;
    encode: (parts: NoInfer<P>) => NoInfer<z.output<W>>;
    canonical?: (parts: NoInfer<P>) => C;
    allocate?: (...args: A) => NoInfer<z.input<W>>;
    equals?: (a: NoInfer<P>, b: NoInfer<P>) => boolean;
    debug?: (parts: NoInfer<P>) => string;
  } & Record<Keys, unknown> & {
      [
        N in Exclude<
          Keys,
          | 'kind'
          | 'schema'
          | 'decode'
          | 'encode'
          | 'canonical'
          | 'allocate'
          | 'equals'
          | 'debug'
        >
      ]: ConfigurationError<
        N extends string
          ? `Unknown definition option "${N}". Use .view(...) for projections and .docs(...) for documentation.`
          : 'Symbol-named options are not supported.'
      >;
    },
): ValueBuilder<K, W, P, Operations<C, A>> {
  validateDefinition(spec, true);
  const {
    kind,
    schema,
    decode,
    encode: encodeParts,
    equals,
    debug,
    allocate,
    canonical,
  } = spec;
  return builder((view, metadata) => {
    const encode = (p: P) => encodeWire(schema, encodeParts(p));
    const bridge = makeSeal(kind, {
      encode,
      debug,
      canonical,
      view,
      equals:
        equals ?? ((a, b) => stableWireKey(encode(a)) === stableWireKey(encode(b))),
    });
    const parse = (input: unknown) => {
      const parsed = parseWire(schema, input);
      if (!parsed.success)
        return err({
          kind,
          reason: 'invalid_wire' as const,
          issues: parsed.error.issues.map((i) => i.message),
        });
      const produced = decode(parsed.data);
      return produced.ok ? ok(bridge.seal(produced.value)) : produced;
    };
    const result = {
      kind,
      is: bridge.is,
      parse,
      parseOrThrow: (input: unknown) => {
        const result = parse(input);
        if (result.ok) return result.value;
        const error = result.error;
        throw new TypeError(
          `${error.kind}: ${error.reason}: ${error.issues.join('; ')}`,
          { cause: error },
        );
      },
      codec: makeWireCodec(
        schema,
        kind,
        decode,
        bridge.seal,
        bridge.is,
        bridge.read,
        encodeParts,
      ),
    };
    if (allocate)
      Object.assign(result, {
        allocate: (...args: Parameters<typeof allocate>) => parse(allocate(...args)),
      });
    Object.assign(result, collections(result as unknown as AnyKind));
    const completed = documentedKind(
      result,
      {
        semantic: true,
        canonical: !!canonical,
        view: Object.keys(view),
      },
      metadata,
    );
    register(kind);
    return completed;
  }) as ValueBuilder<K, W, P, Operations<C, A>>;
}
export function defineDerived<
  const K extends string,
  I,
  P,
  const Keys extends PropertyKey = never,
>(
  spec: {
    kind: LiteralKind<K>;
    derive: (input: I) => ProducerResult<P>;
    debug?: (parts: NoInfer<P>) => string;
  } & Record<Keys, unknown> & {
      [N in Exclude<Keys, 'kind' | 'derive' | 'debug'>]: ConfigurationError<
        N extends 'canonical' | 'encode' | 'allocate' | 'equals' | 'schema'
          ? `Derived definitions cannot configure ${N}. Only semantic definitions support this option.`
          : N extends string
            ? `Unknown definition option "${N}". Use .view(...) for projections and .docs(...) for documentation.`
            : 'Symbol-named options are not supported.'
      >;
    },
): DerivedBuilder<K, I, P> {
  validateDefinition(spec, false);
  const { kind, derive, debug } = spec;
  return builder((view, metadata) => {
    const bridge = makeSeal<P>(kind, { debug, view });
    const result = {
      kind,
      is: bridge.is,
      derive: (input: I) => {
        const produced = derive(input);
        return produced.ok ? ok(bridge.seal(produced.value)) : produced;
      },
    };
    Object.assign(result, collections(result as unknown as AnyKind));
    const completed = documentedKind(
      result,
      {
        semantic: false,
        canonical: false,
        view: Object.keys(view),
      },
      metadata,
    );
    register(kind);
    return completed;
  }) as DerivedBuilder<K, I, P>;
}
