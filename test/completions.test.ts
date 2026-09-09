import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript-5-7';
import { resolve } from 'node:path';

test('autocomplete suggests only configured documentation and law capabilities', () => {
  const filename = resolve('test/completion-fixture.ts');
  const source = `
    import {defineValue,defineDerived} from '../src/index.js';
    import {assertValueLaws,assertDerivedLaws} from '../src/laws.js';
    import * as fc from 'fast-check';
    import {z} from 'zod';
    const ok = <T,>(value:T) => ({ok:true as const,value});
    const Basic=defineValue({kind:'completion/basic',wire:z.string(),decode:ok}).with({toWireShape:p=>p});
    const Full=defineValue({kind:'completion/full',wire:z.string(),decode:ok}).with({toWireShape:p=>p,canonical:p=>({text:p}),allocate:()=>'',view:{suffix:p=>p.slice(-6)}});
    const Derived=defineDerived({kind:'completion/derived',derive:(s:string)=>ok(s)}).with({});
    const Viewed=defineDerived({kind:'completion/viewed',derive:(s:string)=>ok(s)}).with({view:{suffix:p=>p.slice(-6)}});
    Basic.docs({ /*basic*/ });
    Full.docs({ /*full*/ });
    Derived.docs({ /*derived*/ });
    Viewed.docs({ /*viewed*/ });
    Full.docs({view:{ /*names*/ }});
    Basic.docs({examples:[{ /*basicExample*/ }]});
    Full.docs({examples:[{ /*fullExample*/ }],view:{suffix:{description:'Suffix'}}});
    Full.docs({examples:[{input:'x',encoded:'x',canonical:{text:'x'}}],view:{suffix:{ /*projectionDoc*/ }}});
    assertValueLaws(Basic,{validWire:fc.string(), /*basicLaws*/ });
    assertValueLaws(Full,{validWire:fc.string(), /*fullLaws*/ });
    assertDerivedLaws(Derived,{validInput:fc.string(), /*derivedLaws*/ });
    assertDerivedLaws(Viewed,{validInput:fc.string(), /*viewedLaws*/ });
    assertValueLaws(Basic,{validWire:fc.string(),projectionMutators:{ /*basicMutators*/ }});
    assertValueLaws(Full,{validWire:fc.string(),projectionMutators:{ /*fullMutators*/ }});
    assertDerivedLaws(Viewed,{validInput:fc.string(),projectionMutators:{ /*viewedMutators*/ }});
    assertDerivedLaws(Viewed,{validInput:fc.string(),projectionMutators:{view:{ /*viewNames*/ }}});
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
        diagnostic.start! >= source.indexOf('Basic.docs('),
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      );
    }
    const expected: Record<string, string[]> = {
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
