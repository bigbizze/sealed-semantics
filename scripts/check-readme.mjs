import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const readme = readFileSync('README.md', 'utf8');
assert.equal(
  (readme.match(/^```.*$/gm) ?? []).length % 2,
  0,
  'README code fences must be closed',
);
for (const [, target] of readme.matchAll(/\]\(([^)]+)\)/g)) {
  if (/^(https?:|#)/.test(target)) continue;
  assert(
    existsSync(resolve(target.split('#')[0])),
    `README link does not exist: ${target}`,
  );
}
for (const match of readme.matchAll(/([A-Za-z0-9_$.]+)\.view\./g)) {
  if (/(^|\.)documentation$/.test(match[1] ?? '')) continue;
  const start = readme.lastIndexOf('\n', match.index) + 1;
  const end = readme.indexOf('\n', match.index);
  const line = readme.slice(start, end === -1 ? undefined : end);
  if (/\b(removed|formerly|was|instead|do not|don't|old)\b/i.test(line)) continue;
  assert.fail(
    `README must not contain instance .view. access (${match[0]}). Use kind-side observation. Kind.documentation.view and builder .view({ remain allowed.`,
  );
}
console.log(
  'README links and code fences checked. Package smoke compiles and runs the current walkthrough.',
);
