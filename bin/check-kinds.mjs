#!/usr/bin/env node
import { glob, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
// A lexical scan, not a compiler or an import resolver. Comments and strings are tokens.
function tokens(source) {
  const out = [];
  const pattern =
    /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|[A-Za-z_$][\w$]*|[^\s]/g;
  for (const m of source.matchAll(pattern)) {
    const s = m[0];
    if (/^\s|^\/\/|^\/\*/.test(s)) continue;
    let value = s;
    if (/^["'`]/.test(s))
      value = s
        .slice(1, -1)
        .replace(
          /\\(?:u\{([\da-f]+)\}|u([\da-f]{4})|x([\da-f]{2})|([\s\S]))/gi,
          (_, a, b, c, d) =>
            a || b || c
              ? String.fromCodePoint(parseInt(a || b || c, 16))
              : ({
                  n: '\n',
                  r: '\r',
                  t: '\t',
                  b: '\b',
                  f: '\f',
                  v: '\v',
                  0: '\0',
                  '\n': '',
                }[d] ?? d),
        );
    out.push({ text: s, value, offset: m.index });
  }
  return out;
}
const patterns = process.argv.slice(2);
if (!patterns.length) {
  console.error('Usage: check-kinds <source roots or globs...>');
  process.exitCode = 2;
} else {
  const files = new Set();
  for (const pattern of patterns) {
    let search = pattern;
    try {
      if ((await stat(pattern)).isDirectory())
        search = pattern.replace(/\/$/, '') + '/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}';
    } catch {}
    let matched = false;
    for await (const file of glob(search)) {
      if ((await stat(file)).isFile()) {
        files.add(resolve(file));
        matched = true;
      }
    }
    if (!matched) {
      console.error(`No source files matched: ${pattern}`);
      process.exitCode = 2;
    }
  }
  const seen = new Map();
  for (const file of [...files].sort()) {
    const source = await readFile(file, 'utf8'),
      ts = tokens(source);
    for (let i = 0; i < ts.length; i++) {
      if (
        !['defineValue', 'defineDerived'].includes(ts[i].text) ||
        ts[i + 1]?.text !== '(' ||
        ts[i + 2]?.text !== '{'
      )
        continue;
      let depth = 1;
      for (let j = i + 3; j < ts.length && depth; j++) {
        const t = ts[j];
        if (t.text === '{') depth++;
        if (t.text === '}') depth--;
        if (depth !== 1 || t.value !== 'kind' || ts[j + 1]?.text !== ':') continue;
        const literal = ts[j + 2];
        if (
          !literal ||
          ![',', '}'].includes(ts[j + 3]?.text) ||
          !/^["'`]/.test(literal.text) ||
          (literal.text.startsWith('`') && literal.text.includes('${'))
        )
          continue;
        const location = `${file}:${source.slice(0, t.offset).split('\n').length}`;
        if (seen.has(literal.value)) {
          console.error(
            `Duplicate kind ${JSON.stringify(literal.value)}: ${seen.get(literal.value)} and ${location}`,
          );
          process.exitCode = 1;
        } else seen.set(literal.value, location);
      }
    }
  }
  if (!process.exitCode)
    console.log(`Checked ${seen.size} kinds in ${files.size} source files.`);
}
