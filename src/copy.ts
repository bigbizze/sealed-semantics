import { isSealed } from './sealed-leaf.js';

const typedArrays = [
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
];
const typedPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedBuffer = Object.getOwnPropertyDescriptor(typedPrototype, 'buffer')!.get!;
const viewBuffer = Object.getOwnPropertyDescriptor(DataView.prototype, 'buffer')!.get!;

// Validate before structuredClone can invoke getters or erase a custom prototype.
// Return graph nodes as well so the law harness can check independent ownership.
export function copyGraph(value: unknown, label: string): object[] {
  const prototype =
    value !== null && typeof value === 'object'
      ? Object.getPrototypeOf(value)
      : undefined;
  if (
    ![
      Date.prototype,
      Map.prototype,
      Set.prototype,
      ArrayBuffer.prototype,
      DataView.prototype,
      ...typedArrays.map((C) => C.prototype),
    ].includes(prototype)
  )
    throw new TypeError(
      `${label}: conversions must return Date, Map, Set, ArrayBuffer, or a standard typed array/DataView. Use view for primitives, arrays, and plain objects.`,
    );
  const active = new Set<object>();
  const done = new Set<object>();
  const nodes: object[] = [];
  const fail = (reason: string): never => {
    throw new TypeError(`${label}: ${reason}`);
  };
  const visit = (x: unknown): void => {
    if (typeof x === 'function' || typeof x === 'symbol')
      fail('functions and symbols cannot be copied');
    if (x === null || typeof x !== 'object') return;
    if (isSealed(x))
      fail('sealed values cannot be copied; convert their observations to data');
    if (active.has(x)) fail('cycles are unsupported');
    if (done.has(x)) return;
    active.add(x);
    const proto = Object.getPrototypeOf(x);
    const array = Array.isArray(x) && proto === Array.prototype;
    const plain = proto === Object.prototype || proto === null;
    const typed =
      typedArrays.some((C) => proto === C.prototype) && ArrayBuffer.isView(x);
    const dataView = proto === DataView.prototype && ArrayBuffer.isView(x);
    const buffer = proto === ArrayBuffer.prototype;
    const date = proto === Date.prototype;
    const map = proto === Map.prototype;
    const set = proto === Set.prototype;
    if (!array && !plain && !typed && !dataView && !buffer && !date && !map && !set)
      fail(
        'unsupported copy result. Use plain data, arrays, Date, Map, Set, ArrayBuffer, or standard typed arrays; use Uint8Array instead of Buffer',
      );
    const keys = Reflect.ownKeys(x);
    if (array && keys.length !== (x as unknown[]).length + 1)
      fail('arrays must be dense without extra properties');
    for (const key of keys) {
      if (typeof key !== 'string') fail('symbol keys cannot be copied');
      const d = Object.getOwnPropertyDescriptor(x, key)!;
      if (array && key === 'length') continue;
      if (!('value' in d) || !d.enumerable)
        fail('accessors and hidden properties cannot be copied');
      if (typed || array) {
        if (
          !/^(0|[1-9][0-9]*)$/.test(key as string) ||
          Number(key) >= (x as unknown[]).length
        )
          fail('arrays cannot have extra properties');
      } else if (!plain) fail('built-in objects cannot have extra properties');
      visit(d.value);
    }
    if (typed || dataView) visit((typed ? typedBuffer : viewBuffer).call(x));
    // These intrinsic methods also reject forged built-in prototypes.
    if (buffer)
      Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!.call(
        x,
      );
    if (date) Date.prototype.getTime.call(x);
    if (map)
      Map.prototype.forEach.call(x, (v: unknown, k: unknown) => {
        visit(k);
        visit(v);
      });
    if (set) Set.prototype.forEach.call(x, visit);
    active.delete(x);
    done.add(x);
    nodes.push(x);
  };
  visit(value);
  return nodes;
}

export function ownedCopy(value: unknown, label: string): unknown {
  copyGraph(value, label);
  return structuredClone(value);
}
