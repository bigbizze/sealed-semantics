import { z } from 'zod';

const reservedFields = new Set([
  'docs',
  'documentation',
  'view',
  'map',
  'set',
  'get',
  'value',
  'kind',
  'is',
  'parse',
  'derive',
  'wire',
  'allocate',
  'canonical',
  'encode',
  'equals',
  'debug',
  'parts',
  'raw',
  'unwrap',
  'fromParts',
  'indexKey',
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
        label === 'fields'
          ? 'Symbol-named fields are not supported. Use a string projection name.'
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
  keys(input, semantic ? ['kind', 'wire', 'decode'] : ['kind', 'derive'], 'definition');
  if (
    !Object.hasOwn(input, 'kind') ||
    typeof input.kind !== 'string' ||
    !/^[^\s/]+\/\S+$/.test(input.kind)
  ) {
    throw new TypeError('kind must be a namespaced string literal');
  }
  callback(input, semantic ? 'decode' : 'derive', 'definition');
  // Zod's hasInstance checks its schema traits, including across installed copies.
  if (
    semantic &&
    (!Object.hasOwn(input, 'wire') || !(input.wire instanceof z.ZodType))
  ) {
    throw new TypeError('definition.wire must be a Zod schema');
  }
}

export function validateOptions(options: unknown, semantic: boolean): void {
  const input = record(options, 'options');
  const callbacks = semantic
    ? ['toWireShape', 'equals', 'allocate', 'canonical', 'debug']
    : ['debug'];
  keys(input, [...callbacks, 'fields'], 'options');
  if (semantic) callback(input, 'toWireShape', 'options');
  for (const name of callbacks) {
    if (Object.hasOwn(input, name)) callback(input, name, 'options');
  }
  if (Object.hasOwn(input, 'fields')) {
    const fields = record(input.fields, 'fields');
    for (const name of Object.keys(fields)) {
      if (reservedFields.has(name)) {
        throw new TypeError(
          `Field name "${name}" is reserved. Choose a different projection name.`,
        );
      }
      callback(fields, name, 'fields');
    }
  }
}
