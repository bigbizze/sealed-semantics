// Internal, platform-independent validation performed by .docs().
import { documentationEqual } from './documentation-equal.js';
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new TypeError(message);
}
assert.equal = (actual: unknown, expected: unknown, message: string) =>
  assert(Object.is(actual, expected), message);
assert.deepEqual = (actual: unknown, expected: unknown, message: string) =>
  assert(documentationEqual(actual, expected), message);
import type { z } from 'zod';
import { decodeWire } from './zod-codec.js';
import type { DocumentationShape } from './documentation.js';
import { stableWireKey } from './keying.js';
import type { AnyKind, ProducerResult } from './types.js';

type Semantic = AnyKind & {
  parse(input: unknown): ProducerResult<any>;
  wire: z.ZodType;
};
function record(value: unknown, label: string): Record<string, any> {
  assert(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `${label} must be an object`,
  );
  for (const key of Reflect.ownKeys(value)) {
    assert(typeof key === 'string', `${label} cannot contain symbol keys`);
    assert(
      'value' in Object.getOwnPropertyDescriptor(value, key)!,
      `${label}.${key} must be a data property`,
    );
  }
  return value as Record<string, any>;
}
function keys(value: object, allowed: readonly string[], label: string): void {
  for (const name of Object.getOwnPropertyNames(value))
    assert(allowed.includes(name), `${label}: unknown property ${name}`);
}
function metadata(kind: AnyKind, shape: DocumentationShape) {
  assert(Object.hasOwn(kind, 'documentation'), `${kind.kind}: missing .docs()`);
  const doc = record((kind as any).documentation, `${kind.kind}.documentation`);
  keys(
    doc,
    [
      'description',
      ...(shape.semantic ? ['examples'] : []),
      ...(shape.view.length ? ['view'] : []),
    ],
    kind.kind,
  );
  if (Object.hasOwn(doc, 'description'))
    assert.equal(
      typeof doc.description,
      'string',
      `${kind.kind}.description must be a string`,
    );
  if (shape.view.length) {
    const view = record(doc.view, `${kind.kind}.view`);
    keys(view, shape.view, `${kind.kind}.view`);
    for (const name of shape.view) {
      assert(
        Object.hasOwn(view, name),
        `${kind.kind}: view.${name} missing description`,
      );
      const field = record(view[name], `${kind.kind}.view.${name}`);
      keys(field, ['description', 'example'], `${kind.kind}.view.${name}`);
      assert(
        typeof field.description === 'string' && field.description.trim().length > 0,
        `${kind.kind}: view.${name} missing description`,
      );
    }
  }
  return { doc, shape };
}
/** Validate every documented input through both acquisition paths and compare its outputs. */
export function validateDocumentation(kind: AnyKind, shape: DocumentationShape): void {
  const { doc } = metadata(kind, shape);
  if (!shape.semantic) return;
  const semantic = kind as Semantic;
  assert(
    Array.isArray(doc.examples) && doc.examples.length > 0,
    `${kind.kind}: examples must be a non-empty array`,
  );
  for (let i = 0; i < doc.examples.length; i++) {
    const label = `${kind.kind}: examples[${i}]`;
    const example = record(doc.examples[i], label);
    keys(
      example,
      ['input', 'encoded', ...(shape.canonical ? ['canonical'] : [])],
      label,
    );
    for (const key of ['input', 'encoded', ...(shape.canonical ? ['canonical'] : [])]) {
      assert(Object.hasOwn(example, key), `${label}.${key} is required`);
    }
    const decoded = decodeWire(semantic.wire, example.input);
    assert(decoded.success, `${label}.input was rejected by wire.safeDecode`);
    assert(kind.is(decoded.data), `${label}: codec returned an invalid brand`);
    const parsed = semantic.parse(example.input);
    assert(parsed.ok, `${label}.input was rejected by parse`);
    if (!parsed.ok) continue;
    assert(kind.is(parsed.value), `${label}: parse returned an invalid brand`);
    const value: any = parsed.value;
    const raw = value.encode();
    assert.deepEqual(raw, example.encoded, `${label}.encoded does not match encode()`);
    assert.equal(
      stableWireKey(raw),
      stableWireKey(example.encoded),
      `${label}.encoded is not valid JSON wire data`,
    );
    assert(value.equals(decoded.data), `${label}: codec and parse disagree`);
    if (shape.canonical) {
      assert.deepEqual(
        value.canonical(),
        example.canonical,
        `${label}.canonical does not match canonical()`,
      );
      assert.deepEqual(
        (decoded.data as any).canonical(),
        example.canonical,
        `${label}: codec canonical does not match`,
      );
    }
    const reparsed = semantic.parse(raw);
    assert(reparsed.ok, `${label}: encoded output was rejected by parse`);
    if (!reparsed.ok) continue;
    assert(value.equals(reparsed.value), `${label}: round trip changed equality`);
    assert.deepEqual(
      reparsed.value.encode(),
      example.encoded,
      `${label}: round trip changed encoding`,
    );
  }
}
