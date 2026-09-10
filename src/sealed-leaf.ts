// Stateless cross-copy protocol. Identity is always the definition's private brand.
export const KIND = Symbol.for('sealed-semantics.kind');
function kindOf(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  try {
    const kind = (value as { [KIND]?: unknown })[KIND];
    return typeof kind === 'string' ? kind : undefined;
  } catch {
    return undefined;
  }
}
export function foreignValue(kind: string, value: unknown, operation: string): string {
  const other = kindOf(value);
  if (other === kind)
    return `${operation} for ${kind}: value belongs to a different definition instance of the same kind name. The defining module may have been re-executed (hot reload or test-runner module isolation), or two copies of sealed-semantics may be installed.`;
  if (other !== undefined)
    return `${operation} for ${kind}: value belongs to a different kind (${other}).`;
  return `${operation} for ${kind}: expected a sealed value from this definition instance.`;
}
// Package-copy authenticity. The token also guards the recoverable base constructor.
export const LEAF_TOKEN: unique symbol = Symbol('sealed leaf construction');
export class SealedLeaf {
  #sealed!: void;
  constructor(token: typeof LEAF_TOKEN) {
    if (token !== LEAF_TOKEN)
      throw new TypeError('Cannot construct a sealed leaf directly');
  }
  static is(value: unknown): value is SealedLeaf {
    return typeof value === 'object' && value !== null && #sealed in value;
  }
}
export const isSealed = SealedLeaf.is;
Object.freeze(SealedLeaf.prototype);
Object.freeze(SealedLeaf);
