// Internal only: never export representation keys through a package entry point.
export function stableWireKey(raw: unknown): string {
  const ancestors = new Set<object>();
  const visit = (value: unknown): string => {
    if (value === null) return 'null';
    if (typeof value === 'string' || typeof value === 'boolean')
      return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value))
      return Object.is(value, -0) ? '-0' : String(value);
    if (typeof value !== 'object' || value === null || ancestors.has(value))
      throw new TypeError('RawWire must be finite, acyclic JSON data');
    const proto = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null)
      throw new TypeError('RawWire must contain only plain JSON objects');
    if (Object.getOwnPropertySymbols(value).length)
      throw new TypeError('RawWire cannot contain symbol keys');
    ancestors.add(value);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Array.isArray(value)) {
        if (Object.keys(descriptors).length !== value.length + 1)
          throw new TypeError(
            'RawWire arrays must be dense and have no extra properties',
          );
        return (
          '[' +
          Array.from({ length: value.length }, (_, i) => {
            const d = descriptors[String(i)];
            if (!d || !('value' in d) || !d.enumerable)
              throw new TypeError('RawWire cannot contain holes or accessors');
            return visit(d.value);
          }).join(',') +
          ']'
        );
      }
      return (
        '{' +
        Object.keys(descriptors)
          .sort()
          .map((key) => {
            const d = descriptors[key]!;
            if (!('value' in d) || !d.enumerable)
              throw new TypeError(
                'RawWire cannot contain accessors or hidden properties',
              );
            return JSON.stringify(key) + ':' + visit(d.value);
          })
          .join(',') +
        '}'
      );
    } finally {
      ancestors.delete(value);
    }
  };
  return visit(raw);
}
