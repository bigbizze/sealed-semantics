import { isSealed } from './sealed-leaf.js';

// Validate the whole graph before freezing any portion. Cycles are rejected;
// shared acyclic children are allowed. No getter is invoked by this traversal.
export function dataGraph(value: unknown, label: string, dates: boolean): object[] {
  const active = new Set<object>();
  const done = new Set<object>();
  const nodes: object[] = [];
  const visit = (x: unknown): void => {
    if (typeof x === 'function')
      throw new TypeError(`${label}: functions are unsupported`);
    if (x === null || typeof x !== 'object' || isSealed(x)) return;
    if (active.has(x)) throw new TypeError(`${label}: cycles are unsupported`);
    if (done.has(x)) return;
    const proto = Object.getPrototypeOf(x);
    const date = dates && proto === Date.prototype;
    const array = Array.isArray(x) && proto === Array.prototype;
    if (!date && !array && proto !== Object.prototype && proto !== null)
      throw new TypeError(
        `${label}: unsupported object. Use plain data objects, arrays${dates ? ', Dates' : ''}, or sealed values`,
      );
    const keys = Reflect.ownKeys(x);
    if (date) {
      Date.prototype.getTime.call(x);
      if (keys.length)
        throw new TypeError(`${label}: Dates cannot have own properties`);
      done.add(x);
      return;
    }
    active.add(x);
    if (array && keys.length !== (x as unknown[]).length + 1)
      throw new TypeError(
        `${label}: arrays must be dense and have no extra properties`,
      );
    for (const key of keys) {
      if (typeof key !== 'string')
        throw new TypeError(`${label}: symbol keys are unsupported`);
      const d = Object.getOwnPropertyDescriptor(x, key)!;
      if (array && key === 'length') continue;
      if (!('value' in d) || !d.enumerable)
        throw new TypeError(
          `${label}: accessors and hidden properties are unsupported`,
        );
      if (
        array &&
        (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= (x as unknown[]).length)
      )
        throw new TypeError(`${label}: arrays cannot have extra properties`);
      visit(d.value);
    }
    active.delete(x);
    done.add(x);
    nodes.push(x);
  };
  visit(value);
  return nodes;
}

export function immutableView<T>(value: T, label: string): T {
  for (const node of dataGraph(value, label, false)) Object.freeze(node);
  return value;
}

// Collision assertion only. Callers validate both graphs first. Property order
// and frozen descriptors do not affect comparison. Sealed leaves are atomic.
export function sameParts(a: unknown, b: unknown): boolean {
  const pairs = new WeakMap<object, WeakSet<object>>();
  const equal = (x: unknown, y: unknown): boolean => {
    if (Object.is(x, y)) return true;
    if (x === null || y === null || typeof x !== 'object' || typeof y !== 'object')
      return false;
    if (isSealed(x) || isSealed(y)) return false;
    if (
      Object.getPrototypeOf(x) === Date.prototype ||
      Object.getPrototypeOf(y) === Date.prototype
    )
      return (
        Object.getPrototypeOf(x) === Date.prototype &&
        Object.getPrototypeOf(y) === Date.prototype &&
        Object.is(Date.prototype.getTime.call(x), Date.prototype.getTime.call(y))
      );
    if (Array.isArray(x) !== Array.isArray(y)) return false;
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
