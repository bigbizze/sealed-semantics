import type { z } from 'zod';
import { validateDefinition, validateOptions } from './definition.js';
import { documentedKind } from './documentation.js';
import { makeSeal } from './seal.js';
import { makeWireCodec, encodeWire, parseWire } from './zod-codec.js';
import { stableWireKey } from './keying.js';
import type {
  ProducerResult,
  ValueOptions,
  ProjectionOptions,
  ValueKind,
  DerivedKind,
  JsonSchema,
  LiteralKind,
  CheckedOptions,
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
export function defineValue<const K extends string, W extends z.ZodType, P>(spec: {
  kind: LiteralKind<K>;
  wire: W & JsonSchema<W>;
  decode: (w: z.output<W>) => ProducerResult<P>;
}): ValueBuilder<K, W, P> {
  validateDefinition(spec, true);
  const { kind, decode } = spec;
  const wire: W = spec.wire;
  return Object.freeze({
    with<const O extends ValueOptions<W, P>>(
      options: CheckedOptions<O, ValueOptions<W, P>>,
    ): ValueKind<K, W, O> {
      validateOptions(options, true);
      const { toWireShape, equals, debug, allocate, canonical } = options;
      const encode = (p: P) => encodeWire(wire, toWireShape(p));
      const bridge = makeSeal(kind, {
        encode,
        debug,
        canonical,
        view: options.view,
        equals:
          equals ?? ((a, b) => stableWireKey(encode(a)) === stableWireKey(encode(b))),
      });
      const parse = (input: unknown) => {
        const parsed = parseWire(wire, input);
        if (!parsed.success)
          return err({
            kind,
            reason: 'invalid_wire' as const,
            issues: parsed.error.issues.map((i) => i.message),
          });
        const result = decode(parsed.data);
        return result.ok ? ok(bridge.seal(result.value)) : result;
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
        wire: makeWireCodec(
          wire,
          kind,
          decode,
          bridge.seal,
          bridge.is,
          bridge.read,
          toWireShape,
        ),
      };
      if (allocate)
        Object.assign(result, {
          allocate: (...args: Parameters<typeof allocate>) => parse(allocate(...args)),
        });
      Object.assign(result, collections(result as unknown as AnyKind));
      const completed = documentedKind(result, {
        semantic: true,
        canonical: !!canonical,
        view: Object.keys(options.view ?? {}),
      }) as unknown as ValueKind<K, W, O>;
      register(kind);
      return completed;
    },
  });
}
export function defineDerived<const K extends string, I, P>(spec: {
  kind: LiteralKind<K>;
  derive: (input: I) => ProducerResult<P>;
}): DerivedBuilder<K, I, P> {
  validateDefinition(spec, false);
  const { kind, derive } = spec;
  return Object.freeze({
    with<const O extends ProjectionOptions<P> & Record<keyof O, unknown>>(
      options: CheckedOptions<O, ProjectionOptions<P>>,
    ): DerivedKind<K, I, O> {
      validateOptions(options, false);
      const bridge = makeSeal<P>(kind, {
        debug: options.debug,
        view: options.view,
      });
      const result = {
        kind,
        is: bridge.is,
        derive: (input: I) => {
          const produced = derive(input);
          return produced.ok ? ok(bridge.seal(produced.value)) : produced;
        },
      };
      Object.assign(result, collections(result as unknown as AnyKind));
      const completed = documentedKind(result, {
        semantic: false,
        canonical: false,
        view: Object.keys(options.view ?? {}),
      }) as unknown as DerivedKind<K, I, O>;
      register(kind);
      return completed;
    },
  });
}
