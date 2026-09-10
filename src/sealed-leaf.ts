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
// The protocol identifies atomic leaves across copies without storing instances.
// Frozen opaque shape checks reject ordinary objects carrying a copied label.
export function isSealed(value: unknown): value is object {
  if (
    typeof value !== 'object' ||
    value === null ||
    !Object.isFrozen(value) ||
    Reflect.ownKeys(value).length !== 0
  )
    return false;
  const proto = Object.getPrototypeOf(value);
  return (
    proto !== null &&
    proto !== Object.prototype &&
    Object.isFrozen(proto) &&
    kindOf(value) !== undefined
  );
}
