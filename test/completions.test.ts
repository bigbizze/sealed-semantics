import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript-5-7';
import { resolve } from 'node:path';

test('autocomplete suggests only configured documentation and law capabilities', () => {
  const filename = resolve('test/completion-fixture.ts');
  const source = `import {defineKind,defineDerived} from '../src/index.js';
    import {assertValueLaws,assertDerivedLaws} from '../src/laws.js';
    import * as fc from 'fast-check';
    import {z} from 'zod';
    const ok = <T,>(value:T) => ({ok:true as const,value});
    const BasicBuilder=defineKind({kind:'completion/basic',
schema:z.string(),
decode:value=>ok(value),
encode:p=>p});
const Basic=BasicBuilder.seal();
    const FullBuilder=defineKind({kind:'completion/full',
schema:z.string(),
decode:value=>ok(value),
encode:p=>p,
canonical:p=>({text:p}),
allocate:()=>''}).view({suffix:p=>p.slice(-6)});
const Full=FullBuilder.seal();
    const DerivedBuilder=defineDerived({kind:'completion/derived',
derive:(s:string)=>ok(s)});
const Derived=DerivedBuilder.seal();
    const ViewedBuilder=defineDerived({kind:'completion/viewed',
derive:(s:string)=>ok(s)}).view({suffix:p=>p.slice(-6)});
const Viewed=ViewedBuilder.seal();
    BasicBuilder.docs({ /*basic*/ }).seal();
    FullBuilder.docs({ /*full*/ }).seal();
    DerivedBuilder.docs({ /*derived*/ }).seal();
    ViewedBuilder.docs({ /*viewed*/ }).seal();
    FullBuilder.docs({view:{ /*names*/ }}).seal();
    BasicBuilder.docs({examples:[{ /*basicExample*/ }]}).seal();
    FullBuilder.docs({examples:[{ /*fullExample*/ }],view:{suffix:{description:'Suffix'}}}).seal();
    FullBuilder.docs({examples:[{input:'x',encoded:'x',canonical:{text:'x'}}],view:{suffix:{ /*projectionDoc*/ }}}).seal();
    assertValueLaws(Basic,{validWire:fc.string(), /*basicLaws*/ });
    assertValueLaws(Full,{validWire:fc.string(), /*fullLaws*/ });
    assertDerivedLaws(Derived,{validInput:fc.string(), /*derivedLaws*/ });
    assertDerivedLaws(Viewed,{validInput:fc.string(), /*viewedLaws*/ });
    assertValueLaws(Basic,{validWire:fc.string(),projectionMutators:{ /*basicMutators*/ }});
    assertValueLaws(Full,{validWire:fc.string(),projectionMutators:{ /*fullMutators*/ }});
    assertDerivedLaws(Viewed,{validInput:fc.string(),projectionMutators:{ /*viewedMutators*/ }});
    assertDerivedLaws(Viewed,{validInput:fc.string(),projectionMutators:{view:{ /*viewNames*/ }}});
    defineKind({ /*definition*/ });
    defineDerived({ /*derivedDefinition*/ });
    BasicBuilder./*builder*/;
    Basic./*kind*/;
    BasicBuilder.docs({examples:[{input:'x',encoded:'x'}]})./*documentedBuilder*/;

  `;
  const options: ts.CompilerOptions = {
    strict: true,
    exactOptionalPropertyTypes: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    types: ['node'],
  };
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [filename],
    getScriptVersion: () => '0',
    getScriptSnapshot: (name) => {
      const text = name === filename ? source : ts.sys.readFile(name);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => process.cwd(),
    getCompilationSettings: () => options,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    fileExists: (name) => name === filename || ts.sys.fileExists(name),
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    realpath: (path) => ts.sys.realpath?.(path) ?? path,
  };
  const service = ts.createLanguageService(host);
  try {
    // Empty editing positions deliberately omit required documentation. Errors
    // may occur there, but never in the producer definitions or law calls.
    for (const diagnostic of service.getSemanticDiagnostics(filename)) {
      assert(
        diagnostic.start! >= source.indexOf('BasicBuilder.docs('),
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      );
    }
    const expected: Record<string, string[]> = {
      definition: [
        'kind',
        'schema',
        'decode',
        'encode',
        'canonical',
        'allocate',
        'equals',
        'debug',
      ],
      derivedDefinition: ['kind', 'derive', 'debug'],
      builder: ['view', 'docs', 'seal'],
      kind: ['kind', 'is', 'parse', 'parseOrThrow', 'codec', 'map', 'set'],
      documentedBuilder: ['docs', 'seal'],
      basic: ['description', 'examples'],
      full: ['description', 'examples', 'view'],
      derived: ['description'],
      viewed: ['description', 'view'],
      names: ['suffix'],
      basicExample: ['input', 'encoded'],
      fullExample: ['input', 'encoded', 'canonical'],
      projectionDoc: ['description', 'example'],
      basicLaws: ['equivalentAliases', 'projectionMutators', 'sealedKinds'],
      fullLaws: [
        'equivalentAliases',
        'allocateArgs',
        'projectionMutators',
        'sealedKinds',
      ],
      derivedLaws: ['sealedKinds'],
      viewedLaws: ['projectionMutators', 'sealedKinds'],
      basicMutators: ['encode'],
      fullMutators: ['encode', 'canonical', 'view'],
      viewedMutators: ['view'],
      viewNames: ['suffix'],
    };
    for (const [marker, names] of Object.entries(expected)) {
      const position = source.indexOf(`/*${marker}*/`);
      const completions = service.getCompletionsAtPosition(filename, position, {});
      assert(completions, marker);
      assert.deepEqual(
        completions.entries.map((e) => e.name).sort(),
        names.sort(),
        marker,
      );
    }
  } finally {
    service.dispose();
  }
});
