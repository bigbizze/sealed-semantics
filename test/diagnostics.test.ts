import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
test('compiler diagnostics name reserved view and explain the correction', () => {
  const dir = mkdtempSync(join(tmpdir(), 'canonical-diagnostics-'));
  try {
    const file = join(dir, 'reserved.mts');
    writeFileSync(
      file,
      `import {defineDerived,ok} from ${JSON.stringify(resolve('src/index.ts'))};\n` +
        ['encode', 'canonical', 'view', 'get', 'parts']
          .map(
            (name) =>
              `defineDerived({kind:'diagnostic/${name}',derive:(s:string)=>ok(s)}).with({view:{${name}:p=>p}});`,
          )
          .join('\n'),
    );
    const result = spawnSync(
      process.execPath,
      [
        resolve('node_modules/typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--target',
        'ES2022',
        '--module',
        'NodeNext',
        '--allowImportingTsExtensions',
        file,
      ],
      { encoding: 'utf8', cwd: dir },
    );
    assert.notEqual(result.status, 0);
    const output = result.stdout + result.stderr;
    for (const name of ['encode', 'canonical', 'view', 'get', 'parts'])
      assert(
        output.includes(
          `Field name \\"${name}\\" is reserved. Choose a different projection name.`,
        ) ||
          output.includes(
            `Field name "${name}" is reserved. Choose a different projection name.`,
          ),
        output,
      );
    assert(!output.includes("implicitly has an 'any' type"), output);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
