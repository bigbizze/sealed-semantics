const LIBRARY_DIR = normalizeFile(new URL('./', import.meta.url).href);

function normalizeFile(file: string): string {
  let value = file.replaceAll('\\', '/');
  if (value.startsWith('file:')) {
    try {
      const url = new URL(value);
      value = decodeURIComponent(url.pathname);
      if (/^\/[A-Za-z]:\//.test(value)) value = value.slice(1);
    } catch {
      value = value.replace(/^file:\/\//, '');
    }
  }
  return value;
}

function parseFrame(line: string): { file: string; line: string } | undefined {
  const trimmed = line.trim();
  const paren = trimmed.match(/\((.+):(\d+):\d+\)$/);
  if (paren?.[1] && paren[2]) return { file: paren[1], line: paren[2] };
  const bare = trimmed.match(/^at (?:async )?(.+):(\d+):\d+$/);
  if (bare?.[1] && bare[2]) return { file: bare[1], line: bare[2] };
  const mozilla = trimmed.match(/@(.+):(\d+):\d+$/);
  if (mozilla?.[1] && mozilla[2]) return { file: mozilla[1], line: mozilla[2] };
  return undefined;
}

function isLibraryFile(file: string): boolean {
  const path = normalizeFile(file);
  if (path.startsWith('node:') || path === 'native' || path.startsWith('eval'))
    return true;
  if (path.includes('/node_modules/tsx/') || path.includes('/node_modules/typescript/'))
    return true;
  return path.startsWith(LIBRARY_DIR);
}

/** One stack capture per definition. The first non-library frame is the caller. */
export function captureDefinedAt(): string | undefined {
  const stack = new Error().stack;
  if (!stack) return undefined;
  for (const raw of stack.split('\n')) {
    const parsed = parseFrame(raw);
    if (!parsed || isLibraryFile(parsed.file)) continue;
    return `${normalizeFile(parsed.file)}:${parsed.line}`;
  }
  return undefined;
}

export function definitionSuffix(name: string, definedAt: string | undefined): string {
  const search = `Search your codebase for the string '${name}' to find the definition.`;
  return definedAt ? `${search} Defined at ${definedAt}.` : search;
}

export function locateMessage(
  message: string,
  name: string,
  definedAt: string | undefined,
): string {
  return `${message} ${definitionSuffix(name, definedAt)}`;
}

export function locateError(
  error: unknown,
  name: string,
  definedAt: string | undefined,
): never {
  throw new TypeError(
    locateMessage(
      error instanceof Error ? error.message : String(error),
      name,
      definedAt,
    ),
  );
}
