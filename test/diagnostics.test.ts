import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
function compile(source: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'sealed-diagnostics-'));
  try {
    symlinkSync(resolve('node_modules'), join(dir, 'node_modules'), 'dir');
    const file = join(dir, 'fixture.mts');
    writeFileSync(
      file,
      `import {defineKind,defineMinted,type ValueOf} from ${JSON.stringify(resolve('src/index.ts'))};
import {assertValueLaws} from ${JSON.stringify(resolve('src/laws.ts'))};
import {z} from 'zod'; import * as fc from 'fast-check';
${source}`,
    );
    const result = spawnSync(
      process.execPath,
      [
        process.env.SEALED_TEST_TYPESCRIPT ??
          resolve('node_modules/typescript/bin/tsc'),
        '--pretty',
        'false',
        '--types',
        'node',
        '--typeRoots',
        resolve('node_modules/@types'),
        '--noEmit',
        '--strict',
        '--exactOptionalPropertyTypes',
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
    assert(!output.includes("implicitly has an 'any' type"), output);
    return output;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test('compiler diagnostics explain missing seal without expanding builders', () => {
  const output =
    compile(`const B=defineKind({kind:'diagnostic/basic',schema:z.string()});
const M=defineMinted({kind:'diagnostic/minted',mint:(s:string)=>({ok:true,value:s})});
type A=ValueOf<typeof B>; type C=ValueOf<typeof M>;`);
  assert(output.includes('Call .seal() on the definition first.'), output);
  assert(output.includes('ValueBuilder<'), output);
  assert(output.includes('MintedBuilder<'), output);
  assert.equal((output.match(/error TS\d+:/g) ?? []).length, 2, output);
});
test('configuration errors describe removed callbacks and invalid capabilities', () => {
  const cases = [
    [
      `defineKind({kind:'diagnostic/conversion',schema:z.string(),decode:(s:string)=>s});`,
      'Configure conversion in a Zod codec passed as schema.',
    ],
    [
      `defineKind({kind:'diagnostic/canonical',schema:z.string(),canonical:(s:string)=>s});`,
      'Expose observations with .view(...)',
    ],
    [
      `B.docs({examples:[{input:'x',encoded:'x',canonical:'x'}]});`,
      'Canonical examples are no longer supported.',
    ],
    [
      `B.docs({examples:[{input:'x',encoded:'x'}],view:{}});`,
      'docs.view requires declared projections.',
    ],
    [
      `B.docs({examples:[{input:'x',encoded:'x'}],views:{}});`,
      'The docs.views property was renamed to view.',
    ],
    [
      `B.view({parts:(s:string)=>s});`,
      'is reserved. Choose a different projection name.',
    ],
    [
      `defineMinted({kind:'diagnostic/m',mint:()=>({ok:true,value:1}),schema:z.string()});`,
      'Minted definitions cannot configure schema.',
    ],
    [
      `defineKind({kind:'diagnostic/any',schema:z.any()});`,
      'Wire schema input must not be any.',
    ],
    [
      `defineKind({kind:'diagnostic/date',schema:z.date()});`,
      'Wire schema input must be JSON-compatible.',
    ],
    [`defineKind({kind:widened,schema:z.string()});`, 'kind must be a string literal'],
    [
      `assertValueLaws(K,{validWire:fc.string(),allocateArgs:fc.constant([])});`,
      'allocateArgs requires an allocator',
    ],
    [
      `assertValueLaws(K,{validWire:fc.string(),projectionMutators:{view:{x:()=>{}}}});`,
      'projectionMutators.view requires declared view projections.',
    ],
  ];
  const output = compile(
    `const B=defineKind({kind:'diagnostic/b',schema:z.string()}); const K=B.seal(); const widened:string='diagnostic/w';\n${cases.map(([source]) => source).join('\n')}`,
  );
  for (const [, message] of cases) assert(output.includes(message!), output);
  assert.equal((output.match(/error TS\d+:/g) ?? []).length, cases.length, output);
});
