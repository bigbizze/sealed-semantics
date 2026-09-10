import { z } from 'zod';
import { foreignValue } from './sealed-leaf.js';
export function makeWireCodec<W extends z.ZodType, V>(
  schema: W,
  definitionName: string,
  seal: (parts: z.output<W>) => V,
  is: (x: unknown) => boolean,
  read: (x: V) => z.output<W>,
) {
  return z.codec(
    schema,
    z.custom<V>(is, {
      error: (issue) =>
        foreignValue(definitionName, issue.input, 'codec encode/validation'),
    }),
    {
      decode: seal,
      encode: read,
    },
  );
}
// Runtime Zod integration. Consumers use Zod's public boundary operations.
export function encodeWire<W extends z.ZodType>(wire: W, value: z.output<W>) {
  return z.encode(wire, value);
}
export function decodeWire<W extends z.ZodType>(wire: W, input: z.input<W>) {
  return z.safeDecode(wire, input);
}
export function isWireSchema(value: unknown): value is z.ZodType {
  // Zod checks schema traits, including schemas from other installed copies.
  return value instanceof z.ZodType;
}

export function parseCodec<W extends z.ZodType>(codec: W, input: unknown): z.output<W> {
  return codec.parse(input);
}
