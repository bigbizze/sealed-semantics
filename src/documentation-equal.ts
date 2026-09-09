// Structural comparison for documentation samples, without Node built-ins.
// Opaque instances (including sealed values) require reference identity.
export function documentationEqual(a: unknown, b: unknown): boolean {
  return equal(a, b, new Map(), new Map());
}
function equal(
  a: unknown,
  b: unknown,
  left: Map<object, object>,
  right: Map<object, object>,
): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (left.has(a) || right.has(b)) return left.get(a) === b && right.get(b) === a;
  left.set(a, b);
  right.set(b, a);
  try {
    if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
      if (a.byteLength !== b.byteLength) return false;
      const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
      const y = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
      return x.every((v, i) => v === y[i]);
    }
    if (a instanceof ArrayBuffer && b instanceof ArrayBuffer)
      return equal(new Uint8Array(a), new Uint8Array(b), left, right);
    if (a instanceof Date && b instanceof Date)
      return Object.is(a.getTime(), b.getTime());
    if (a instanceof RegExp && b instanceof RegExp)
      return (
        a.source === b.source && a.flags === b.flags && a.lastIndex === b.lastIndex
      );
    if (a instanceof Map && b instanceof Map) {
      if (a.size !== b.size) return false;
      const remaining = [...b];
      for (const [key, value] of a) {
        const i = remaining.findIndex(
          ([k, v]) => equal(key, k, left, right) && equal(value, v, left, right),
        );
        if (i < 0) return false;
        remaining.splice(i, 1);
      }
      return true;
    }
    if (a instanceof Set && b instanceof Set) {
      if (a.size !== b.size) return false;
      const remaining = [...b];
      for (const value of a) {
        const i = remaining.findIndex((v) => equal(value, v, left, right));
        if (i < 0) return false;
        remaining.splice(i, 1);
      }
      return true;
    }
    if (
      !Array.isArray(a) &&
      Object.getPrototypeOf(a) !== Object.prototype &&
      Object.getPrototypeOf(a) !== null
    )
      return false;
    const keys = Reflect.ownKeys(a);
    if (keys.length !== Reflect.ownKeys(b).length) return false;
    return keys.every((key) => {
      const x = Object.getOwnPropertyDescriptor(a, key)!;
      const y = Object.getOwnPropertyDescriptor(b, key);
      if (!y || x.enumerable !== y.enumerable) return false;
      if ('value' in x && 'value' in y) return equal(x.value, y.value, left, right);
      // Read accessor observations, so different getters cannot hide output drift.
      return equal(Reflect.get(a, key), Reflect.get(b, key), left, right);
    });
  } finally {
    left.delete(a);
    right.delete(b);
  }
}
