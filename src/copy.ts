const typedPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedName = Object.getOwnPropertyDescriptor(
  typedPrototype,
  Symbol.toStringTag,
)!.get!;
const typedBuffer = Object.getOwnPropertyDescriptor(typedPrototype, 'buffer')!.get!;
const bufferLength = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'byteLength',
)!.get!;

// Intrinsic getters inspect internal slots, not overridable public properties.
// Buffer and cross-realm Uint8Arrays qualify; proxies and forged prototypes do not.
export function snapshotBytes(value: unknown, label: string): Uint8Array {
  if (typedName.call(value) !== 'Uint8Array')
    throw new TypeError(`${label}: copy producers must return a genuine Uint8Array`);
  const buffer = typedBuffer.call(value);
  try {
    bufferLength.call(buffer);
  } catch {
    throw new TypeError(`${label}: shared-memory-backed Uint8Array is not supported`);
  }
  try {
    // The typed-array constructor copies bytes without calling a user iterator.
    return new Uint8Array(value as Uint8Array);
  } catch {
    throw new TypeError(`${label}: Uint8Array storage must be attached and readable`);
  }
}
