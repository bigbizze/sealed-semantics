import test from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import { z } from 'zod';
import { assertValueLaws, assertDerivedLaws } from '../src/laws.js';
import { defineValue, defineDerived, ok } from '../src/index.js';
import { UserId, Sha256Digest, NamespaceId, ContentAddress, PreparedWrite } from '../examples/reference.js';
const hex = (n:number) => fc.array(fc.constantFrom(...'0123456789abcdef'),{minLength:n,maxLength:n}).map(a=>a.join(''));
const spelling = hex(32);
const uuid = spelling.map(s=>`${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`);
const namespace=fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'),{minLength:1,maxLength:20}).map(a=>`ns:${a.join('')}`);
const address = fc.record({namespace_id:namespace,content_class:fc.constantFrom('primary' as const,'attachment' as const),digest:hex(64)});
test('all semantic reference laws, aliases, and allocation',()=>{
 assertValueLaws(UserId,{validWire:fc.oneof(spelling.map(s=>`usr_${s}`),uuid.map(s=>`user:${s}`)),equivalentAliases:uuid.map(s=>[`user:${s}`,`usr_${s.replaceAll('-','')}`]),allocateArgs:uuid.map(s=>[()=>s] as [()=>string])});
 assertValueLaws(Sha256Digest,{validWire:hex(64)});
 assertValueLaws(NamespaceId,{validWire:namespace});
 assertValueLaws(ContentAddress,{validWire:address});
});
test('derived reference laws include copies of graphs with sealed nodes',()=>{
 const sealed=address.map(w=>{const r=ContentAddress.parse(w);if(!r.ok)throw Error();return r.value;});
 assertDerivedLaws(PreparedWrite,{validInput:fc.record({rows:fc.array(fc.record({id:fc.string(),content:sealed})),content:fc.array(sealed)})});
});
test('law harness detects shallow-copy leaks and incorrect equality',()=>{
 const Leak=defineDerived({kind:'law/leak',derive:(x:number)=>ok({nested:{x}})}).with({fields:{bad:p=>({nested:p.nested})}});
 assert.throws(()=>assertDerivedLaws(Leak,{validInput:fc.integer()}),(e:any)=>/projection leaked/.test(String(e.cause)));
 const Wrong=defineValue({kind:'law/wrong-equality',wire:z.int(),decode:w=>ok(w)}).with({toWireShape:p=>p,equals:()=>true});
 assert.throws(()=>assertValueLaws(Wrong,{validWire:fc.integer()}),(e:any)=>/custom equality/.test(String(e.cause)));
});
test('custom mutable types require and support explicit mutators',()=>{
 const Dates=defineDerived({kind:'law/dates',derive:(x:number)=>ok({time:x})}).with({fields:{date:p=>new Date(p.time)}});
 assert.throws(()=>assertDerivedLaws(Dates,{validInput:fc.integer()}),(e:any)=>/projectionMutator/.test(String(e.cause)));
 assertDerivedLaws(Dates,{validInput:fc.integer(),projectionMutators:{fields:{date:d=>d.setTime(0)}}});
});
test('law harness rejects non-finite wire numbers and preserves negative zero',()=>{
 const Numbers=defineValue({kind:'law/numbers',wire:z.custom<number>(x=>typeof x==='number'),decode:w=>ok(w)}).with({toWireShape:p=>p});
 assertValueLaws(Numbers,{validWire:fc.constantFrom(-0,0,1,-1)});
 for(const bad of [NaN,Infinity,-Infinity]) assert.throws(()=>assertValueLaws(Numbers,{validWire:fc.constant(bad)}),(e:any)=>/finite/.test(String(e.cause)));
});
