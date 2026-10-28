import { z } from 'zod';
import { foreignValue } from './sealed-leaf.js';
import type { DeepReadonly } from './types.js';
export function makeWireCodec<W extends z.ZodType, V>(
  schema: W,
  definitionName: string,
  seal: (parts: z.output<W>) => V,
  is: (x: unknown) => boolean,
  read: (x: V) => z.output<W>,
  definedAt?: string,
) {
  return z.codec(
    schema,
    z.custom<V>(is, {
      error: (issue) =>
        foreignValue(definitionName, issue.input, 'codec encode/validation', definedAt),
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
/**
 * Encodes readonly Parts, or a readonly part of them, back to wire data through the schema
 * that produced them.
 *
 * Use it inside `key`, `view`, `copy`, and `debug`. Those callbacks receive `DeepReadonly<Parts>`,
 * and `z.encode` rejects that type because Zod schemas output mutable arrays. Do not cast to call
 * `z.encode`; call this instead. Pass a sub-schema to encode a nested part.
 *
 * Do not use it with a schema that contains a one-way `.transform(...)`: Zod cannot encode a
 * transform, so the call throws at runtime on the first parse. Use `z.codec(...)` with an explicit
 * `encode` for a normalization that must encode.
 *
 * Encoders must not mutate Parts; the snapshots are frozen and a mutation throws.
 *
 * @example
 * const member = z.object({ user: UserId.codec, roles: z.array(z.string()) });
 * const team = z.object({ name: z.string(), members: z.array(member) });
 * const Team = defineSeal({
 *   name: 'app/team',
 *   schema: team,
 *   key: (parts) => JSON.stringify(encodeParts(team, parts)),
 * })
 *   .view({ firstMember: (parts) => encodeParts(member, parts.members[0]!) })
 *   .seal();
 */
export function encodeParts<W extends z.ZodType>(
  schema: W,
  parts: NoInfer<DeepReadonly<z.output<W>>>,
): z.input<W> {
  return z.encode(schema, parts as z.output<W>);
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
