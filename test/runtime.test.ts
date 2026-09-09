import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import * as api from '../src/index.js';
import { defineValue, defineDerived, ok, err, IdMap, IdSet, type Result } from '../src/index.js';
import { stableWireKey } from '../src/keying.js';
import { UserId, Sha256Digest, ContentAddress, PreparedWrite } from '../examples/reference.js';
function value<T>(r:Result<T>):T {if(!r.ok)throw Error(JSON.stringify(r.error));return r.value;}
const raw='usr_0123456789abcdef';
test('private brand, prototype forgery, constructor recovery, and hidden state',()=>{
 const v=value(UserId.parse(raw)),fake=Object.create(Object.getPrototypeOf(v));
 assert(UserId.is(v)); assert(!UserId.is(fake)); assert(!UserId.is(new Proxy(v,{})));
 assert(!z.safeEncode(UserId.wire,fake).success);
 assert(!UserId.wire.out.safeParse(fake).success);
 assert.throws(()=>new (Object.getPrototypeOf(v).constructor)(Symbol('canonical-type/construct'),{}),TypeError);
 assert.throws(()=>UserId.canonical(fake),TypeError);
 assert.throws(()=>v.equals(fake),TypeError);
 assert.throws(()=>Object.getPrototypeOf(v).encode.call(fake),TypeError);
 assert.deepEqual(Reflect.ownKeys(v),[]);
 assert.deepEqual(Object.keys(api).sort(),['IdMap','IdSet','defineDerived','defineValue','err','ok']);
 for(const name of ['parts','raw','unwrap','fromParts','indexKey','seal','hasBrand','unseal']) {assert(!(name in UserId));assert(!(name in v));}
 assert(!UserId.is(structuredClone(v)));
});
test('Result parse preserves producer error while codec emits a custom issue',()=>{
 const error={kind:'test/reject',reason:'invalid_parts' as const,issues:['producer detail']};
 const Reject=defineValue({kind:'test/reject',wire:z.string(),decode:()=>err(error)}).with({toWireShape:()=>''});
 const r=Reject.parse('x');assert(!r.ok);assert.equal(r.error,error);
 const c=z.safeDecode(Reject.wire,'x');assert(!c.success);assert.equal(c.error.issues[0]?.code,'custom');assert.match(c.error.message,/producer detail/);
 assert.throws(()=>z.decode(Reject.wire,'x'),z.ZodError);
 const invalid=Reject.parse(5);assert(!invalid.ok);assert.equal(invalid.error.reason,'invalid_wire');
 const badAllocate=defineValue({kind:'test/bad-allocate',wire:z.string().min(2),decode:w=>ok(w)}).with({toWireShape:p=>p,allocate:()=>''});
 assert.equal(badAllocate.allocate().ok,false);
 const D=defineDerived({kind:'test/derive-error',derive:(_:unknown)=>err({...error,reason:'invalid_input' as const})}).with({});
 assert.equal(D.derive(null).ok,false);
});
test('aliases and nested codecs encode the complete raw contract',()=>{
 const a=value(UserId.parse('user:01234567-89ab-cdef-0123-456789abcdef'));
 const b=value(UserId.parse('usr_0123456789abcdef0123456789abcdef'));
 assert(a!==b);assert(a.equals(b));assert.deepEqual(a.encode(),b.encode());
 const w={namespace_id:'ns:hello',content_class:'primary' as const,digest:'ab'.repeat(32)};
 const address=value(ContentAddress.parse(w));
 assert(Sha256Digest.is(ContentAddress.digest(address)));
 assert.deepEqual(address.encode(),w);
 assert.deepEqual(z.encode(z.object({address:ContentAddress.wire}),{address}),{address:w});
 assert(z.safeDecode(ContentAddress.wire,w).success);
 assert.deepEqual(z.encode(ContentAddress.wire,address),w);
});
test('semantic Map/Set behavior retains original keys without exposing internal strings',()=>{
 const a=value(UserId.parse(raw)),b=value(UserId.parse(raw));
 const map=new IdMap<typeof UserId,number>(UserId).set(a,1).set(b,2);
 assert.equal(map.size,1);assert.equal(map.get(b),2);assert.equal([...map.keys()][0],a);
 const entry=[...map][0]!;entry[1]=99;assert.equal(map.get(a),2);
 const context={called:0};map.forEach(function(this:typeof context,v,k,m){assert.equal(this,context);assert.equal(v,2);assert.equal(k,a);assert.equal(m,map);this.called++;},context);assert.equal(context.called,1);
 const set=new IdSet(UserId).add(a).add(b);assert.equal(set.size,1);assert.deepEqual([...set.entries()],[[a,a]]);
 assert.throws(()=>map.has(Object.create(Object.getPrototypeOf(a))),TypeError);
 assert.throws(()=>set.add(value(Sha256Digest.parse('ab'.repeat(32))) as any),TypeError);
 assert(map.delete(b));assert(!map.has(a));set.clear();assert.equal(set.size,0);
});
test('derived identity and producer copy obligations in reference example',()=>{
 const address=value(ContentAddress.parse({namespace_id:'ns:x',content_class:'primary',digest:'ab'.repeat(32)}));
 const input={rows:[{id:'first',content:address}],content:[address]};
 const a=value(PreparedWrite.derive(input)),b=value(PreparedWrite.derive(input));
 input.rows[0]!.id='changed';input.content.length=0;
 assert.equal(PreparedWrite.rows(a)[0]!.id,'first');assert.equal(PreparedWrite.contentToRetain(a)[0],address);
 assert(!a.equals(b));assert(a.equals(a));
 const map=new IdMap<typeof PreparedWrite,number>(PreparedWrite).set(a,1).set(b,2);assert.equal(map.size,2);
 const digest=value(Sha256Digest.parse('ab'.repeat(32)));Sha256Digest.canonical(digest).value.fill(0);assert.equal(digest.encode(),'ab'.repeat(32));
});
test('duplicate definitions and invalid declarations fail',()=>{
 assert.throws(()=>defineValue({kind:'example/user-id',wire:z.string(),decode:w=>ok(w)}).with({toWireShape:p=>p}),/Duplicate kind/);
 assert.throws(()=>defineDerived({kind:'example/user-id',derive:()=>ok(1)}).with({}),/Duplicate kind/);
 assert.throws(()=>defineDerived({kind:'unqualified',derive:()=>ok(1)}).with({}),/namespaced/);
 assert.throws(()=>defineDerived({kind:'test/reserved',derive:()=>ok(1)}).with({fields:{is:(p:number)=>p}} as any),/Reserved field/);
});
test('deterministic JSON validates the entire runtime domain and preserves -0',()=>{
 assert.equal(stableWireKey({z:1,a:[-0,'\n',true,null]}),'{"a":[-0,"\\n",true,null],"z":1}');
 assert(Object.is(JSON.parse(stableWireKey(-0)),-0));
 for(const bad of [NaN,Infinity,-Infinity,undefined,1n,Symbol(),()=>0,new Date(),new Uint8Array(1),[undefined],Array(1),{n:Infinity},Object.defineProperty({},'x',{get(){throw Error('getter must not run');},enumerable:true})]) assert.throws(()=>stableWireKey(bad),TypeError);
 const cyclic:any={};cyclic.self=cyclic;assert.throws(()=>stableWireKey(cyclic),TypeError);
 const shared={a:1};assert.equal(stableWireKey([shared,shared]),'[{"a":1},{"a":1}]');
});
test('reference callbacks preserve observations across repeated calls',()=>{
 const digest=value(Sha256Digest.parse('ab'.repeat(32)));
 const user=value(UserId.parse(raw));
 const address=value(ContentAddress.parse({namespace_id:'ns:x',content_class:'primary',digest:'ab'.repeat(32)}));
 const plan=value(PreparedWrite.derive({rows:[{id:'row',content:address}],content:[address]}));
 const before={user:user.encode(),digest:digest.encode(),address:address.encode(),rows:PreparedWrite.rows(plan),content:PreparedWrite.contentToRetain(plan)};
 for(let i=0;i<5;i++) {
  UserId.canonical(user);user.debug();user.equals(value(UserId.parse(raw)));
  Sha256Digest.canonical(digest);digest.debug();digest.equals(value(Sha256Digest.parse('ab'.repeat(32))));
  ContentAddress.namespace(address);ContentAddress.contentClass(address);ContentAddress.digest(address);address.debug();
  plan.debug();PreparedWrite.rows(plan);PreparedWrite.contentToRetain(plan);
 }
 assert.deepEqual({user:user.encode(),digest:digest.encode(),address:address.encode(),rows:PreparedWrite.rows(plan),content:PreparedWrite.contentToRetain(plan)},before);
 assert.equal(UserId.parse('user:'+'-'.repeat(36)).ok,false);
});
