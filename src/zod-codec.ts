import { z } from 'zod';
import type { ProducerResult } from './types.js';
export function makeWireCodec<W extends z.ZodType, P, V>(
  wire: W,
  kind: string,
  decode: (w: z.output<W>) => ProducerResult<P>,
  seal: (p: P) => V,
  is: (x: unknown) => boolean,
  read: (x: V) => P,
  shape: (p: P) => z.output<W>,
) {
  return z.codec(wire, z.custom<V>(is, `${kind} sealed value expected`), {
    decode: (input, ctx) => {
      const result = decode(input);
      if (result.ok) return seal(result.value);
      ctx.issues.push({
        code: 'custom',
        input,
        message: `${result.error.kind}: ${result.error.reason}: ${result.error.issues.join('; ')}`,
      });
      return z.NEVER;
    },
    encode: (value) => shape(read(value)),
  });
}

// Keep runtime schema operations here. Public types still use Zod directly.
export function encodeWire<W extends z.ZodType>(wire: W, value: z.output<W>) {
  return z.encode(wire, value);
}
export function parseWire<W extends z.ZodType>(wire: W, input: unknown) {
  return wire.safeParse(input);
}
export function decodeWire<W extends z.ZodType>(wire: W, input: z.input<W>) {
  return z.safeDecode(wire, input);
}
export function isWireSchema(value: unknown): value is z.ZodType {
  // Zod checks schema traits, including schemas from other installed copies.
  return value instanceof z.ZodType;
}
