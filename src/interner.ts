import type { SemanticKey } from './types.js';

if (typeof WeakRef !== 'function' || typeof FinalizationRegistry !== 'function') {
  throw new Error(
    'sealed-semantics requires WeakRef and FinalizationRegistry in this runtime. In Cloudflare Workers, enable the enable_weak_ref compatibility flag and remove disable_weak_ref. No fallback is supported.',
  );
}

const NEGATIVE_ZERO = Symbol('negative zero');
type InternKey = SemanticKey | typeof NEGATIVE_ZERO;
const internKey = (key: SemanticKey): InternKey =>
  Object.is(key, -0) ? NEGATIVE_ZERO : key;

// Cleanup owns a particular reference, not the key forever. Exported only internally
// so ownership can be tested without depending on garbage-collector scheduling.
export function cleanup<V extends object>(
  table: Map<InternKey, WeakRef<V>>,
  held: { key: InternKey; ref: WeakRef<V> },
): void {
  if (table.get(held.key) === held.ref) table.delete(held.key);
}

export function makeInterner<V extends object>() {
  const table = new Map<InternKey, WeakRef<V>>();
  const finalizer = new FinalizationRegistry<{ key: InternKey; ref: WeakRef<V> }>(
    (held) => cleanup(table, held),
  );
  return {
    get: (key: SemanticKey) => table.get(internKey(key))?.deref(),
    put: (key: SemanticKey, value: V) => {
      const ref = new WeakRef(value);
      const normalized = internKey(key);
      table.set(normalized, ref);
      finalizer.register(value, { key: normalized, ref });
    },
  };
}
