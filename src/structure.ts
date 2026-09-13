import { NAME_LABEL, isSealed } from './sealed-leaf.js';
import type { DeepReadonly } from './types.js';

const arrayIndex = /^(0|[1-9][0-9]*)$/;
const ownedSnapshots = new WeakSet<object>();

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

function defineFrozenValue(target: object, key: string, value: unknown): void {
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

    const descriptors = Object.getOwnPropertyDescriptors(x);
    const keys = Reflect.ownKeys(descriptors);
    for (const key of keys) {
      if (typeof key !== 'string')
        throw new TypeError(`${label}: symbol keys are unsupported`);
    }

    active.add(x);
    if (array) {
      const source = x as unknown[];
      const snapshot = new Array(source.length);
      snapshots.set(x, snapshot);
      for (const key of keys as string[]) {
        if (key === 'length') continue;
        if (!arrayIndex.test(key) || Number(key) >= source.length)
          throw new TypeError(`${label}: arrays cannot have extra properties`);
      }
      for (let index = 0; index < source.length; index++) {
        const key = String(index);
        const descriptor = descriptors[key];
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
          throw new TypeError(
            `${label}: arrays must be dense and contain only enumerable data properties`,
          );
        defineFrozenValue(snapshot, key, visit(descriptor.value));
      }
      active.delete(x);
      return freezeSnapshot(snapshot);
    }

    const snapshot = Object.create(proto) as Record<string, unknown>;
    snapshots.set(x, snapshot);
    for (const key of keys as string[]) {
      const descriptor = descriptors[key]!;
      if (!('value' in descriptor) || !descriptor.enumerable)
        throw new TypeError(
          `${label}: accessors and hidden properties are unsupported`,
        );
      defineFrozenValue(snapshot, key, visit(descriptor.value));
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
  const pairs = new WeakMap<object, WeakSet<object>>();
  const equal = (x: unknown, y: unknown): boolean => {
    if (Object.is(x, y)) return true;
    if (x === null || y === null || typeof x !== 'object' || typeof y !== 'object')
      return false;
    if (isSealed(x) || isSealed(y)) return false;
    if (Array.isArray(x) !== Array.isArray(y)) return false;
    if (Array.isArray(x) && (x as unknown[]).length !== (y as unknown[]).length)
      return false;
    if (Object.getPrototypeOf(x) !== Object.getPrototypeOf(y)) return false;
    if (pairs.get(x)?.has(y)) return true;
    if (!pairs.has(x)) pairs.set(x, new WeakSet());
    pairs.get(x)!.add(y);
    const keys = Object.keys(x);
    if (keys.length !== Object.keys(y).length) return false;
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
