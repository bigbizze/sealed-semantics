import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const lines = readFileSync('README.md', 'utf8').trimEnd().split('\n').length;
assert(lines < 150, 'README must remain under 150 lines');
console.log(`${lines} README lines.`);
