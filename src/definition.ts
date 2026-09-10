import { isWireSchema } from './zod-codec.js';

const reservedFields = new Set([
  'docs',
  'documentation',
  'view',
  'to',
  'is',
  'mint',
  'schema',
  'codec',
  'seal',
  'allocate',
  'debug',
  'parts',
  '__proto__',
  'constructor',
  'prototype',
  'then',
  'toJSON',
  'valueOf',
  'toString',
]);

// Validate only configuration objects, never the producer's Parts graph.
function record(input: unknown, label: string): Record<string, unknown> {
  if (
    typeof input !== 'object' ||
    input === null ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  ) {
    throw new TypeError(`${label} must be a plain object`);
  }
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key === 'symbol') {
      throw new TypeError(
        label === 'view'
          ? 'Symbol-named projections are not supported. Use a string projection name.'
          : `${label} cannot contain symbol keys`,
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (!descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
  }
  return input as Record<string, unknown>;
}

function keys(
  input: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      throw new TypeError(
        `Unknown ${label} property "${key}". Allowed properties: ${allowed.join(', ')}`,
      );
    }
  }
}

function callback(input: Record<string, unknown>, name: string, label: string): void {
  if (!Object.hasOwn(input, name) || typeof input[name] !== 'function') {
    throw new TypeError(`${label}.${name} must be a function`);
  }
}

export function validateDefinition(spec: unknown, semantic: boolean): void {
  const input = record(spec, 'definition');
  keys(
    input,
    semantic
      ? ['name', 'schema', 'allocate', 'key', 'debug']
      : ['name', 'mint', 'debug'],
    'definition',
  );
  if (
    !Object.hasOwn(input, 'name') ||
    typeof input.name !== 'string' ||
    input.name.trim().length === 0
  ) {
    throw new TypeError('name must be a non-empty string literal');
  }
  if (!semantic) callback(input, 'mint', 'definition');
  else callback(input, 'key', 'definition');
  for (const name of ['allocate', 'key', 'debug']) {
    if (Object.hasOwn(input, name)) callback(input, name, 'definition');
  }
  if (semantic && (!Object.hasOwn(input, 'schema') || !isWireSchema(input.schema))) {
    throw new TypeError('definition.schema must be a Zod schema');
  }
}

export function validateView(projections: unknown): void {
  const view = record(projections, 'view');
  for (const name of Object.keys(view)) {
    if (reservedFields.has(name)) {
      throw new TypeError(
        `Field name "${name}" is reserved. Choose a different projection name.`,
      );
    }
    callback(view, name, 'view');
  }
}

export function validateConversions(conversions: unknown): void {
  const value = record(conversions, 'to');
  for (const name of Object.keys(value)) {
    if (['then', '__proto__', 'constructor', 'prototype', 'toJSON'].includes(name))
      throw new TypeError(`Conversion name "${name}" is reserved.`);
    callback(value, name, 'to');
  }
}
