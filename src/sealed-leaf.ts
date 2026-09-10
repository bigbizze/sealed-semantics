// Stateless cross-copy protocol. Identity is always the definition's private brand.
export const NAME_LABEL = Symbol.for('sealed-semantics.name');
function nameOf(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  try {
    const definitionName = (value as { [NAME_LABEL]?: unknown })[NAME_LABEL];
    return typeof definitionName === 'string' ? definitionName : undefined;
  } catch {
    return undefined;
  }
}
export function foreignValue(
  definitionName: string,
  value: unknown,
  operation: string,
): string {
  const other = nameOf(value);
  if (other === definitionName)
    return `${operation} for ${definitionName}: value belongs to a different definition instance of the same definition name. The defining module may have been re-executed (hot reload or test-runner module isolation), or two copies of sealed-semantics may be installed.`;
  if (other !== undefined)
    return `${operation} for ${definitionName}: value belongs to a different definition (${other}).`;
  return `${operation} for ${definitionName}: expected a sealed value from this definition instance.`;
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
