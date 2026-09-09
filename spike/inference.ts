import {z} from 'zod';
import {defineValue,defineDerived,ok} from './api.js';
import type {ValueOf} from '../src/types.js';
type Equal<A,B> = (<T>()=>T extends A ? 1:2) extends (<T>()=>T extends B ? 1:2) ? true:false;
type Assert<T extends true> = T;
const UserId=defineValue({kind:'example/user-id',wire:z.string(),decode:w=>{
 type Input=Assert<Equal<typeof w,string>>;
 return ok({spelling:w});
}}).with({toWireShape:p=>{
 type Parts=Assert<Equal<typeof p,{spelling:string}>>;
 return p.spelling;
},allocate:(gen:()=>string)=>gen(),canonical:p=>({type:'utf8',value:p.spelling}),debug:p=>p.spelling});
const Sha256Digest=defineValue({kind:'example/sha256',wire:z.string(),decode:hex=>ok({bytes:Uint8Array.from(hex,c=>c.charCodeAt(0))})}).with({
 toWireShape:p=>String(p.bytes.length),equals:(a,b)=>{
 type A=Assert<Equal<typeof a,{bytes:Uint8Array<ArrayBuffer>}>>;
 type B=Assert<Equal<typeof b,typeof a>>;
 return a.bytes.length===b.bytes.length;
 },canonical:p=>({type:'bytes',value:p.bytes.slice()})
});
const NamespaceId=defineValue({kind:'example/namespace',wire:z.string(),decode:w=>ok(w)}).with({toWireShape:p=>p});
const ContentAddress=defineValue({kind:'example/content-address',wire:z.object({namespace_id:NamespaceId.wire,content_class:z.enum(['primary','attachment']),digest:Sha256Digest.wire}),decode:w=>{
 type Nested=Assert<Equal<typeof w.digest,ValueOf<typeof Sha256Digest>>>;
 return ok(w);
}}).with({toWireShape:p=>p,fields:{namespace:p=>p.namespace_id,contentClass:p=>p.content_class,digest:p=>p.digest}});
interface PrepareInput { rows:string[]; content:ValueOf<typeof ContentAddress>[] }
const PreparedWrite=defineDerived({kind:'example/prepared-write',derive:(input:PrepareInput)=>ok({rows:[...input.rows],contentToRetain:[...input.content]})}).with({fields:{rows:p=>[...p.rows] as readonly string[],contentToRetain:p=>[...p.contentToRetain] as readonly ValueOf<typeof ContentAddress>[]}});
type Allocation=Assert<Equal<Parameters<typeof UserId.allocate>,[gen:()=>string]>>;
type Canonical=Assert<Equal<ReturnType<typeof UserId.canonical>,{type:string,value:string}>>;
type Field=Assert<Equal<ReturnType<typeof ContentAddress.contentClass>,'primary'|'attachment'>>;
type ReadonlyField=Assert<Equal<ReturnType<typeof PreparedWrite.rows>,readonly string[]>>;
type Raw=Assert<Equal<z.input<typeof ContentAddress.wire>,{namespace_id:string,content_class:'primary'|'attachment',digest:string}>>;
declare const user:ValueOf<typeof UserId>;
declare const digest:ValueOf<typeof Sha256Digest>;
// @ts-expect-error distinct kind
user.equals(digest);
// @ts-expect-error distinct kind
const wrong:ValueOf<typeof UserId>=digest;
// @ts-expect-error non-JSON input
 defineValue({kind:'bad/date',wire:z.date(),decode:w=>ok(w)});
// @ts-expect-error no representation access
UserId.parts;
// @ts-expect-error exact allocator parameters
UserId.allocate(4);
// @ts-expect-error derived values have no wire
PreparedWrite.wire;
const Mutable=defineDerived({kind:'example/mutable-type',derive:(s:string)=>ok({items:[s]})}).with({fields:{items:p=>[...p.items]}});
type MutableField=Assert<Equal<ReturnType<typeof Mutable.items>,string[]>>;
