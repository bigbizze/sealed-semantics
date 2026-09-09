import { rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Do not carry removed modules into the next published package.
rmSync('dist', { recursive: true, force: true });
execFileSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'],
  { stdio: 'inherit' },
);
