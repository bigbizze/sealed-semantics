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
assert(
  !/\.view\./.test(readme),
  'README must not contain instance .view. access; use kind-side observation. Builder .view({ remains allowed.',
);
console.log(
  'README links and code fences checked. Package smoke compiles and runs the current walkthrough.',
);
