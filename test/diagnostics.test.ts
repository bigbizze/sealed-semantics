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
              `defineDerived({kind:'diagnostic/${name}',derive:(s:string)=>ok(s)}).view({${name}:p=>p}).seal();`,
          )
          .join('\n'),
    );
    const result = spawnSync(
      process.execPath,
      [
        process.env.SEALED_TEST_TYPESCRIPT ??
          resolve('node_modules/typescript/bin/tsc'),
        // These assertions parse diagnostics, so terminal styling must be disabled.
        '--pretty',
        'false',
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

test('ValueOf explains missing .seal without expanding the builder signature', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sealed-diagnostics-'));
  symlinkSync(resolve('node_modules'), join(dir, 'node_modules'), 'dir');
  try {
    const file = join(dir, 'incomplete.mts');
    writeFileSync(
      file,
      `
      import { defineKind, defineDerived, type ValueOf } from ${JSON.stringify(resolve('src/index.ts'))};
      import { z } from 'zod';
      const ok = <T,>(value:T) => ({ok:true as const,value});
      const Semantic = defineKind({ kind: 'diagnostic/semantic', schema: z.string(), decode: spelling => ok({ spelling }), encode:p=>p.spelling });
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
        // These assertions parse diagnostics, so terminal styling must be disabled.
        '--pretty',
        'false',
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
          /ValueOf requires a completed kind\. Call \.seal\(\) on the definition first\./g,
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
      `Builder.docs({examples:[{input:'x',encoded:'x'}],views:{}}).seal();`,
      'The docs.views property was renamed to view. Use .docs({ view: ... }).',
    ],
    [
      `Builder.docs({examples:[{input:'x',encoded:'x',canonical:{type:'utf8',value:'x'}}]}).seal();`,
      'Example canonical requires canonical in defineKind(...). Add canonical or remove the example canonical.',
    ],
    [
      `Builder.docs({examples:[{input:'x',encoded:'x',canonical:'x'}]}).seal();`,
      'Example canonical requires canonical in defineKind(...)',
    ],
    [
      `Builder.docs({examples:[{input:'x',encoded:'x'}],view:{suffix:{description:'Suffix'}}}).seal();`,
      'docs.view requires declared projections. Add projections to .view({ ... }) first.',
    ],
    [
      `Empty.docs({view:{suffix:{example:'x'}}}).seal();`,
      'docs.view requires declared projections.',
    ],
    [
      `DerivedBuilder.docs({exampleWire:'x'}).seal();`,
      'Separate exampleWire/exampleCanonical fields were replaced by examples: [{ input, encoded, canonical }].',
    ],
    [
      `DerivedBuilder.docs({exampleCanonical:{type:'utf8',value:'x'}}).seal();`,
      'Separate exampleWire/exampleCanonical fields were replaced by examples: [{ input, encoded, canonical }].',
    ],
    [
      `defineKind({kind:'diagnostic/typo',schema:z.string(),decode:(s:string)=>ok(s),encode:p=>p,canoncal:()=>0});`,
      'Unknown definition option',
    ],
    [
      `defineKind({kind:'diagnostic/fields',schema:z.string(),decode:(s:string)=>ok(s),encode:p=>p,fields:{}});`,
      'Use .view(...) for projections',
    ],
    ...['canonical', 'allocate', 'encode', 'equals'].map((name): [string, string] => [
      `defineDerived({kind:'diagnostic/derived-option',derive:(s:string)=>ok(s),${name}:()=>0});`,
      `Derived definitions cannot configure ${name}. Only semantic definitions support this option.`,
    ]),
    [
      `defineKind({kind:'diagnostic/symbol',schema:z.string(),decode:(s:string)=>ok(s),encode:p=>p,[Symbol.iterator]:()=>0});`,
      'Symbol-named options are not supported.',
    ],
    [
      `defineKind({kind:'diagnostic/any',schema:z.any(),decode:value=>ok(value),encode:p=>p});`,
      'Wire schema input must not be any. Use a schema with a specific JSON input type.',
    ],
    ...['date()', 'unknown()', 'bigint()', 'string().optional()'].map(
      (schema): [string, string] => [
        `defineKind({kind:'diagnostic/schema',schema:z.${schema},decode:value=>ok(value),encode:()=>{throw new Error()}});`,
        'Wire schema input must be JSON-compatible.',
      ],
    ),
    [
      `defineKind({kind:widened,schema:z.string(),decode:(s:string)=>ok(s),encode:p=>p});`,
      'kind must be a string literal, not a widened string. Use a literal or as const.',
    ],
    [
      `assertValueLaws(Basic,{validWire:fc.string(),allocateArgs:fc.constant([])});`,
      'allocateArgs requires an allocator in defineKind(...). Add allocate or remove allocateArgs.',
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
      `import {defineKind,defineDerived} from ${JSON.stringify(resolve('src/index.ts'))};`,
      `import {assertValueLaws,assertDerivedLaws} from ${JSON.stringify(resolve('src/laws.ts'))};`,
      `import {z} from 'zod';`,
      `import * as fc from 'fast-check';`,
      `const Builder=defineKind({kind:'diagnostic/basic',schema:z.string(),decode:value=>ok(value),encode:p=>p});`,
      `const Basic=Builder.seal();`,
      `const DerivedBuilder=defineDerived({kind:'diagnostic/derived',derive:(s:string)=>ok(s)});`,
      `const Derived=DerivedBuilder.seal();`,
      `const Empty=DerivedBuilder.view({});`,
      `declare const widened:string;`,
    ];
    writeFileSync(file, [...prelude, ...cases.map(([code]) => code)].join('\n'));
    const result = spawnSync(
      process.execPath,
      [
        process.env.SEALED_TEST_TYPESCRIPT ??
          resolve('node_modules/typescript/bin/tsc'),
        // These assertions parse diagnostics, so terminal styling must be disabled.
        '--pretty',
        'false',
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
