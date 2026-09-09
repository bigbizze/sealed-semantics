import { z } from 'zod';
import type { ProducerResult } from './types.js';
export function makeCodec<W extends z.ZodType, P, V>(
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
