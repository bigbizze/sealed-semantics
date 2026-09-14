import { NAME_LABEL, isSealed } from './sealed-leaf.js';
import type { DeepReadonly } from './types.js';

const arrayIndex = /^(0|[1-9][0-9]*)$/;
const ownedSnapshots = new WeakSet<object>();

function isArrayIndexKey(key: string): boolean {
  const first = key.charCodeAt(0);
  if (!(first >= 48 && first <= 57)) return false;
  if (!arrayIndex.test(key)) return false;
  return Number(key) < 2 ** 32 - 1;
}

function canonicalKeys(keys: readonly string[]): string[] {
  let indexKeys: string[] | undefined;
  let stringKeys: string[] | undefined;
  for (const key of keys) {
    if (isArrayIndexKey(key)) (indexKeys ??= []).push(key);
    else (stringKeys ??= []).push(key);
  }
  if (indexKeys) indexKeys.sort((a, b) => Number(a) - Number(b));
  if (stringKeys) stringKeys.sort();
  return indexKeys
    ? stringKeys
      ? indexKeys.concat(stringKeys)
      : indexKeys
    : (stringKeys ?? []);
}

function hasDiagnosticName(value: object): boolean {
  let cursor: object | null = value;
  while (cursor !== null) {
    if (Object.hasOwn(cursor, NAME_LABEL)) return true;
    cursor = Object.getPrototypeOf(cursor);
  }
  return false;
}

function unsupportedObject(label: string, value: object): TypeError {
  if (hasDiagnosticName(value))
    return new TypeError(
      `${label}: unsupported sealed-looking object. Only sealed values from this installed package copy can be graph leaves; rejected values may originate from another installed package copy or be imitations.`,
    );
  return new TypeError(
    `${label}: unsupported object. Use primitives, dense arrays, plain data objects, or sealed values from this installed package copy.`,
  );
}

function defineDataProperty(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function freezeSnapshot<T extends object>(snapshot: T): T {
  Object.freeze(snapshot);
  ownedSnapshots.add(snapshot);
  return snapshot;
}

// Snapshot the graph before it becomes private state or a public view. The
// traversal reads descriptors, so accessors are rejected without invocation.
function snapshotValue<T>(
  value: T,
  label: string,
  reuseOwnedSnapshots: boolean,
): DeepReadonly<T> {
  const active = new WeakSet<object>();
  const snapshots = new WeakMap<object, object>();
  const visit = (x: unknown): unknown => {
    if (typeof x === 'function')
      throw new TypeError(`${label}: functions are unsupported`);
    if (x === null || typeof x !== 'object' || isSealed(x)) return x;
    if (reuseOwnedSnapshots && ownedSnapshots.has(x)) return x;
    if (active.has(x)) throw new TypeError(`${label}: cycles are unsupported`);
    const ready = snapshots.get(x);
    if (ready) return ready;

    const proto = Object.getPrototypeOf(x);
    const array = Array.isArray(x) && proto === Array.prototype;
    if (!array && proto !== Object.prototype && proto !== null)
      throw unsupportedObject(label, x);

    const keys = Reflect.ownKeys(x);
    for (const key of keys) {
      if (typeof key !== 'string')
        throw new TypeError(`${label}: symbol keys are unsupported`);
    }
    const orderedKeys = canonicalKeys(keys as string[]);

    active.add(x);
    if (array) {
      const source = x as unknown[];
      const snapshot: unknown[] = [];
      snapshots.set(x, snapshot);
      for (const key of orderedKeys) {
        if (key === 'length') continue;
        if (!isArrayIndexKey(key) || Number(key) >= source.length)
          throw new TypeError(`${label}: arrays cannot have extra properties`);
      }
      for (let index = 0; index < source.length; index++) {
        const key = String(index);
        const descriptor = Object.getOwnPropertyDescriptor(source, key);
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
          throw new TypeError(
            `${label}: arrays must be dense and contain only enumerable data properties`,
          );
        snapshot.push(visit(descriptor.value));
      }
      active.delete(x);
      return freezeSnapshot(snapshot);
    }

    const snapshot = Object.create(proto) as Record<string, unknown>;
    snapshots.set(x, snapshot);
    for (const key of orderedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(x, key)!;
      if (!('value' in descriptor) || !descriptor.enumerable)
        throw new TypeError(
          `${label}: accessors and hidden properties are unsupported`,
        );
      const value = visit(descriptor.value);
      if (key === '__proto__' && proto === Object.prototype)
        defineDataProperty(snapshot, key, value);
      else snapshot[key] = value;
    }
    active.delete(x);
    return freezeSnapshot(snapshot);
  };
  return visit(value) as DeepReadonly<T>;
}

export function snapshotData<T>(value: T, label: string): DeepReadonly<T> {
  return snapshotValue(value, label, false);
}

export function immutableView<T>(value: T, label: string): DeepReadonly<T> {
  return snapshotValue(value, label, true);
}

// Collision assertion only. Callers pass snapshotted graphs. Property order and
// frozen descriptors do not affect comparison. Sealed leaves are atomic.
export function sameParts(a: unknown, b: unknown): boolean {
  const forward = new WeakMap<object, object>();
  const reverse = new WeakMap<object, object>();
  const equal = (x: unknown, y: unknown): boolean => {
    if (x === null || y === null || typeof x !== 'object' || typeof y !== 'object')
      return Object.is(x, y);
    if (isSealed(x) || isSealed(y)) return Object.is(x, y);
    const mappedY = forward.get(x);
    const mappedX = reverse.get(y);
    if (mappedY || mappedX) return mappedY === y && mappedX === x;
    if (Array.isArray(x) !== Array.isArray(y)) return false;
    if (Array.isArray(x) && (x as unknown[]).length !== (y as unknown[]).length)
      return false;
    if (Object.getPrototypeOf(x) !== Object.getPrototypeOf(y)) return false;
    forward.set(x, y);
    reverse.set(y, x);
    const keys = Object.keys(x);
    const otherKeys = Object.keys(y);
    if (keys.length !== otherKeys.length) return false;
    return keys.every(
      (key) =>
        Object.hasOwn(y, key) &&
        equal(
          Object.getOwnPropertyDescriptor(x, key)!.value,
          Object.getOwnPropertyDescriptor(y, key)!.value,
        ),
    );
  };
  return equal(a, b);
}
