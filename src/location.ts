const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
]);
const OUTPUT_SEGMENTS = new Set([
  'dist',
  'build',
  'out',
  '.next',
  '.output',
  '.svelte-kit',
  '.nuxt',
  '.vercel',
  '.netlify',
]);

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

let libraryDir: string | undefined;
let libraryDirAttempted = false;

function isFallbackNoise(file: string): boolean {
  const path = normalizeFile(file);
  if (path.startsWith('node:') || path === 'native' || path.startsWith('eval'))
    return true;
  if (path.includes('/node_modules/tsx/') || path.includes('/node_modules/typescript/'))
    return true;
  if (!libraryDirAttempted) {
    libraryDirAttempted = true;
    try {
      libraryDir = normalizeFile(new URL('./', import.meta.url).href);
    } catch {
      return false;
    }
  }
  return libraryDir !== undefined && path.startsWith(libraryDir);
}

function formatDefinedAt(file: string, line: string, cwd: string): string | undefined {
  const path = normalizeFile(file);
  const root = normalizeFile(cwd).replace(/\/+$/, '');
  const extension = path.match(/\.[^./]+$/)?.[0];
  if (!extension || !SOURCE_EXTENSIONS.has(extension)) return undefined;
  const prefix = `${root}/`;
  if (!path.startsWith(prefix)) return undefined;
  const relative = path.slice(prefix.length);
  if (relative.split('/').some((segment) => OUTPUT_SEGMENTS.has(segment)))
    return undefined;
  return `${relative}:${line}`;
}

/** Parse a stack into a cwd-relative `file:line`, or `undefined` when the frame is implausible. */
export function definedAtFromStack(
  stack: string,
  cwd: string,
  firstFrameIsCaller: boolean,
): string | undefined {
  for (const raw of stack.split('\n')) {
    const parsed = parseFrame(raw);
    if (!parsed) continue;
    if (!firstFrameIsCaller && isFallbackNoise(parsed.file)) continue;
    return formatDefinedAt(parsed.file, parsed.line, cwd);
  }
  return undefined;
}

/** One best-effort stack capture per definition. Production, browsers, and implausible frames yield nothing. */
export function captureDefinedAt(caller: Function): string | undefined {
  try {
    if (typeof process === 'undefined') return undefined;
    if (process.env == null) return undefined;
    if (process.env.NODE_ENV === 'production') return undefined;
    if (typeof process.cwd !== 'function') return undefined;
    const holder: { stack?: string | undefined } = {};
    const hasLimit = 'stackTraceLimit' in Error;
    const previous = hasLimit ? Error.stackTraceLimit : undefined;
    try {
      if (hasLimit) Error.stackTraceLimit = 5;
      if (typeof Error.captureStackTrace === 'function')
        Error.captureStackTrace(holder, caller);
      else holder.stack = new Error().stack;
    } finally {
      if (hasLimit) Error.stackTraceLimit = previous!;
    }
    if (!holder.stack) return undefined;
    return definedAtFromStack(
      holder.stack,
      process.cwd(),
      typeof Error.captureStackTrace === 'function',
    );
  } catch {
    return undefined;
  }
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
