import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
test('compiler diagnostics name reserved view and explain the correction', () => {
  const dir = mkdtempSync(join(tmpdir(), 'canonical-diagnostics-'));
  try {
    const file = join(dir, 'reserved.mts');
    writeFileSync(
      file,
      `import {defineDerived} from ${JSON.stringify(resolve('src/index.ts'))};\nconst ok = <T,>(value:T) => ({ok:true as const,value});\n` +
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
        process.env.SEALED_TEST_TYPESCRIPT ??
          resolve('node_modules/typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--types',
        'node',
        '--typeRoots',
        resolve('node_modules/@types'),
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

test('ValueOf explains missing .with without expanding the builder signature', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sealed-diagnostics-'));
  symlinkSync(resolve('node_modules'), join(dir, 'node_modules'), 'dir');
  try {
    const file = join(dir, 'incomplete.mts');
    writeFileSync(
      file,
      `
      import { defineValue, defineDerived, type ValueOf } from ${JSON.stringify(resolve('src/index.ts'))};
      import { z } from 'zod';
      const ok = <T,>(value:T) => ({ok:true as const,value});
      const Semantic = defineValue({ kind: 'diagnostic/semantic', wire: z.string(), decode: spelling => ok({ spelling }) });
      const Derived = defineDerived({ kind: 'diagnostic/derived', derive: (s: string) => ok(s) });
      type MissingSemantic = ValueOf<typeof Semantic>;
      type MissingDerived = ValueOf<typeof Derived>;
    `,
    );
    const result = spawnSync(
      process.execPath,
      [
        process.env.SEALED_TEST_TYPESCRIPT ??
          resolve('node_modules/typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--types',
        'node',
        '--typeRoots',
        resolve('node_modules/@types'),
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
    const output = result.stdout + result.stderr;
    assert.notEqual(result.status, 0);
    assert.equal((output.match(/error TS2344/g) ?? []).length, 2, output);
    assert.equal((output.match(/error TS\d+/g) ?? []).length, 2, output);
    assert.equal(
      (
        output.match(
          /ValueOf requires a completed kind\. Call \.with\(\.\.\.\) on the definition first\./g,
        ) ?? []
      ).length,
      2,
      output,
    );
    assert(output.includes('ValueBuilder<'), output);
    assert(output.includes('DerivedBuilder<'), output);
    assert(!output.includes('with<const O'), output);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('configuration diagnostics explain missing prerequisites and forbidden options', () => {
  const cases: [string, string][] = [
    [
      `Basic.docs({examples:[{input:'x',encoded:'x'}],views:{}});`,
      'The docs.views property was renamed to view. Use .docs({ view: ... }).',
    ],
    [
      `Basic.docs({examples:[{input:'x',encoded:'x',canonical:{type:'utf8',value:'x'}}]});`,
      'Example canonical requires canonical in .with(...). Add canonical or remove the example canonical.',
    ],
    [
      `Basic.docs({examples:[{input:'x',encoded:'x',canonical:'x'}]});`,
      'Example canonical requires canonical in .with(...)',
    ],
    [
      `Basic.docs({examples:[{input:'x',encoded:'x'}],view:{suffix:{description:'Suffix'}}});`,
      'docs.view requires declared projections. Add projections to .with({ view: ... }) first.',
    ],
    [
      `Empty.docs({view:{suffix:{example:'x'}}});`,
      'docs.view requires declared projections.',
    ],
    [
      `Derived.docs({exampleWire:'x'});`,
      'Separate exampleWire/exampleCanonical fields were replaced by examples: [{ input, encoded, canonical }].',
    ],
    [
      `Derived.docs({exampleCanonical:{type:'utf8',value:'x'}});`,
      'Separate exampleWire/exampleCanonical fields were replaced by examples: [{ input, encoded, canonical }].',
    ],
    [
      `Builder.with({toWireShape:(p:string)=>p,canoncal:()=>0});`,
      'Unknown .with option',
    ],
    [
      `Builder.with({toWireShape:(p:string)=>p,fields:{}});`,
      'The fields option was renamed to view. Configure projections under view.',
    ],
    ...['canonical', 'allocate', 'toWireShape', 'equals'].map(
      (name): [string, string] => [
        `DerivedBuilder.with({${name}:()=>0});`,
        `Derived definitions cannot configure ${name}. Only semantic definitions support this option.`,
      ],
    ),
    [
      `Builder.with({toWireShape:(p:string)=>p,[Symbol.iterator]:()=>0});`,
      'Symbol-named options are not supported.',
    ],
    [
      `defineValue({kind:'diagnostic/any',wire:z.any(),decode:ok});`,
      'Wire schema input must not be any. Use a schema with a specific JSON input type.',
    ],
    ...['date()', 'unknown()', 'bigint()', 'string().optional()'].map(
      (schema): [string, string] => [
        `defineValue({kind:'diagnostic/schema',wire:z.${schema},decode:ok});`,
        'Wire schema input must be JSON-compatible.',
      ],
    ),
    [
      `defineValue({kind:widened,wire:z.string(),decode:ok});`,
      'kind must be a string literal, not a widened string. Use a literal or as const.',
    ],
    [
      `assertValueLaws(Basic,{validWire:fc.string(),allocateArgs:fc.constant([])});`,
      'allocateArgs requires an allocator in .with(...). Add allocate or remove allocateArgs.',
    ],
    [
      `assertValueLaws(Basic,{validWire:fc.string(),projectionMutators:{canonical:()=>{}}});`,
      'projectionMutators.canonical requires a declared canonical operation. Remove this mutator.',
    ],
    [
      `assertDerivedLaws(Derived,{validInput:fc.string(),projectionMutators:{encode:()=>{}}});`,
      'projectionMutators.encode requires a declared encode operation. Remove this mutator.',
    ],
    [
      `assertValueLaws(Basic,{validWire:fc.string(),projectionMutators:{view:{suffix:()=>{}}}});`,
      'projectionMutators.view requires declared view projections.',
    ],
  ];
  const dir = mkdtempSync(join(tmpdir(), 'sealed-diagnostics-'));
  symlinkSync(resolve('node_modules'), join(dir, 'node_modules'), 'dir');
  try {
    const file = join(dir, 'configuration.mts');
    const prelude = [
      `const ok = <T,>(value:T) => ({ok:true as const,value});`,
      `import {defineValue,defineDerived} from ${JSON.stringify(resolve('src/index.ts'))};`,
      `import {assertValueLaws,assertDerivedLaws} from ${JSON.stringify(resolve('src/laws.ts'))};`,
      `import {z} from 'zod';`,
      `import * as fc from 'fast-check';`,
      `const Builder=defineValue({kind:'diagnostic/basic',wire:z.string(),decode:ok});`,
      `const Basic=Builder.with({toWireShape:p=>p});`,
      `const DerivedBuilder=defineDerived({kind:'diagnostic/derived',derive:(s:string)=>ok(s)});`,
      `const Derived=DerivedBuilder.with({});`,
      `const Empty=DerivedBuilder.with({view:{}});`,
      `declare const widened:string;`,
    ];
    writeFileSync(file, [...prelude, ...cases.map(([code]) => code)].join('\n'));
    const result = spawnSync(
      process.execPath,
      [
        process.env.SEALED_TEST_TYPESCRIPT ??
          resolve('node_modules/typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--types',
        'node',
        '--typeRoots',
        resolve('node_modules/@types'),
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
    const output = result.stdout + result.stderr;
    assert.notEqual(result.status, 0);
    assert.equal((output.match(/error TS\d+/g) ?? []).length, cases.length, output);
    for (const [index, [, message]] of cases.entries()) {
      const line = prelude.length + index + 1;
      const diagnostic = output
        .split(/(?=configuration\.mts\()/)
        .filter((s) => s.startsWith(`configuration.mts(${line},`))
        .join('\n');
      assert(
        diagnostic.includes(message),
        `Expected ${message} on line ${line}:\n${output}`,
      );
    }
    assert(!output.includes("implicitly has an 'any' type"), output);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
