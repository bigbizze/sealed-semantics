import { z } from 'zod';
import { validateDefinition, validateOptions } from './definition.js';
import { makeSeal } from './seal.js';
import { makeCodec } from './codec.js';
import { stableWireKey } from './keying.js';
import type {
  Result,
  ValueOptions,
  ProjectionOptions,
  ValueKind,
  DerivedKind,
  JsonSchema,
  LiteralKind,
  CheckedOptions,
  AnyKind,
} from './types.js';
export type { Result, ValueError, ValueOf, JsonValue, AnyKind } from './types.js';
import { ValueMap, ValueSet } from './collections.js';
export type { ValueMap, ValueSet } from './collections.js';
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
const seen = new Set<string>();
function register(kind: string) {
  if (seen.has(kind)) throw new TypeError(`Duplicate kind: ${kind}`);
  seen.add(kind);
}
function collections<K extends AnyKind>(kind: K) {
  return { map: <V>() => new ValueMap<K, V>(kind), set: () => new ValueSet(kind) };
}
export function defineValue<const K extends string, W extends z.ZodType, P>(spec: {
  kind: LiteralKind<K>;
  wire: W & JsonSchema<W>;
  decode: (w: z.output<W>) => Result<P>;
}): {
  with<const O extends ValueOptions<W, P>>(
    options: CheckedOptions<O, ValueOptions<W, P>>,
  ): ValueKind<K, W, O>;
} {
  validateDefinition(spec, true);
  const { kind, wire, decode } = spec;
  return {
    with<const O extends ValueOptions<W, P>>(
      options: CheckedOptions<O, ValueOptions<W, P>>,
    ): ValueKind<K, W, O> {
      validateOptions(options, true);
      register(kind);
      const { toWireShape, equals, debug, allocate, canonical } = options;
      const encode = (p: P) => z.encode(wire, toWireShape(p));
      const bridge = makeSeal(kind, {
        encode,
        debug,
        canonical,
        fields: options.fields,
        equals:
          equals ?? ((a, b) => stableWireKey(encode(a)) === stableWireKey(encode(b))),
      });
      const parse = (input: unknown) => {
        const parsed = wire.safeParse(input);
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
        wire: makeCodec(
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
      return result as unknown as ValueKind<K, W, O>;
    },
  };
}
export function defineDerived<const K extends string, I, P>(spec: {
  kind: LiteralKind<K>;
  derive: (input: I) => Result<P>;
}): {
  with<const O extends ProjectionOptions<P>>(
    options: CheckedOptions<O, ProjectionOptions<P>>,
  ): DerivedKind<K, I, O>;
} {
  validateDefinition(spec, false);
  const { kind, derive } = spec;
  return {
    with<const O extends ProjectionOptions<P>>(
      options: CheckedOptions<O, ProjectionOptions<P>>,
    ): DerivedKind<K, I, O> {
      validateOptions(options, false);
      register(kind);
      const bridge = makeSeal<P>(kind, {
        debug: options.debug,
        fields: options.fields,
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
      return result as unknown as DerivedKind<K, I, O>;
    },
  };
}
