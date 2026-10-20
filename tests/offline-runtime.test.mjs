import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

// A small asynchronous IDB test adapter: writes commit after request success,
// so tests exercise transaction completion and failure, not just request events.
const stores = new Map(); let failCommit = false;
const db = {
  objectStoreNames: { contains: name => stores.has(name) },
  createObjectStore(name) { stores.set(name,new Map()); }, close() {},
  transaction(name,mode) {
    const tx={};
    const run=(kind,value)=>{
      const request={};
      queueMicrotask(()=>{
        const store=stores.get(name); const key=value?.id || value?.key || value?.scopeUserPublicId;
        request.result=kind==='getAll' ? structuredClone([...store.values()]) : kind==='get' ? structuredClone(store.get(value)) : key;
        request.onsuccess?.();
        queueMicrotask(()=>{
          if(mode==='readwrite' && name==='operations' && failCommit) {failCommit=false;tx.error=new Error('commit aborted');tx.onabort?.();return;}
          if(kind==='put') store.set(key,structuredClone(value)); if(kind==='delete') store.delete(value);
          tx.oncomplete?.();
        });
      }); return request;
    };
    tx.objectStore=()=>({getAll:()=>run('getAll'),get:value=>run('get',value),put:value=>run('put',value),delete:value=>run('delete',value)});
    return tx;
  },
};
const memory=new Map(); const nav={onLine:false};
const originals=Object.fromEntries(['window','localStorage','navigator','indexedDB','fetch'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
Object.defineProperty(globalThis,'navigator',{configurable:true,value:nav});
globalThis.window={};globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
globalThis.indexedDB={open:()=>{const request={result:db};queueMicrotask(()=>{request.onupgradeneeded?.();request.onsuccess?.();});return request;}};
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root,resolve:{alias:{'@':root}},server:{middlewareMode:true}});
const offline=await vite.ssrLoadModule('/lib/offline-queue.ts');
after(async()=>{await vite.close();for(const [key,descriptor] of Object.entries(originals)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});

test('offline writes wait for durable commit and preserve their identifiers when reconnecting',async()=>{
  await offline.activateOfflineScope('user-a');
  const result=await offline.executeOrQueue('client.create',{publicId:crypto.randomUUID(),name:'Cliente offline'});assert.equal(result.queued,true);
  const [operation]=await offline.listOperations();assert.ok(operation.id);assert.equal((await offline.getQueueStatus()).pending,1);
  failCommit=true;await assert.rejects(()=>offline.enqueueOperation('client.create',{name:'No guardado'}),/commit aborted/);assert.equal((await offline.listOperations()).length,1);
  nav.onLine=true;const sent=[];globalThis.fetch=async(_url,options)=>{sent.push(JSON.parse(options.body));return Response.json({result:{ok:true}});};
  const synced=await offline.flushOfflineQueue();assert.equal(synced.synced,1);assert.equal(sent[0].id,operation.id);assert.equal((await offline.listOperations()).length,0);
});
test('network failures stay queued and a conflict blocks dependent operations until reviewed',async()=>{
  nav.onLine=true;globalThis.fetch=async()=>{throw new TypeError('network down');};
  assert.equal((await offline.executeOrQueue('quote.create',{project:'Presupuesto'})).queued,true);
  nav.onLine=false;await offline.executeOrQueue('order.update',{publicId:crypto.randomUUID(),notes:'Depende del anterior'});
  nav.onLine=true;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({error:'Conflicto en otro equipo'},{status:409});};
  const first=await offline.flushOfflineQueue();assert.equal(first.failed,1);assert.equal(first.pending,2);assert.equal(calls,1);
  await offline.flushOfflineQueue();assert.equal(calls,1);
  const [operation]=await offline.listOperations();await offline.retryOperation(operation.id);globalThis.fetch=async()=>Response.json({result:{ok:true}});
  assert.equal((await offline.flushOfflineQueue()).synced,2);
});
test('cached records are available offline only in their original user scope and never bypass authorization errors',async()=>{
  nav.onLine=true;globalThis.fetch=async()=>Response.json({materials:['Cable']});
  assert.deepEqual(await offline.cachedApi('/api/order-materials?publicId=test'),{materials:['Cable']});
  nav.onLine=false;assert.deepEqual(await offline.cachedApi('/api/order-materials?publicId=test'),{materials:['Cable']});
  await offline.activateOfflineScope('user-b');await assert.rejects(()=>offline.cachedApi('/api/order-materials?publicId=test'),/Abra este registro/);
  await offline.activateOfflineScope('user-a');nav.onLine=true;globalThis.fetch=async()=>Response.json({error:'Sin permiso'},{status:403});await assert.rejects(()=>offline.cachedApi('/api/order-materials?publicId=test'),/No fue posible/);
  await offline.clearOfflineSessionData();assert.equal(await offline.loadResource('/api/order-materials?publicId=test'),null);
});
test('reopening field execution retains unsynced entries without duplicates or technician costs',async()=>{
  const {overlayOfflineExecution}=await vite.ssrLoadModule('/lib/offline-records.ts');
  const data={activities:[],entries:[],materialRequests:[],showFinancials:false};
  const operation={id:crypto.randomUUID(),type:'entry.create',payload:{workOrderPublicId:'order-a',entryType:'material',description:'Cable',quantity:10,unit:'m',unitCost:9999},createdAt:'2026-10-20T10:00:00Z'};
  const first=overlayOfflineExecution(data,[operation,{...operation,id:crypto.randomUUID(),payload:{...operation.payload,workOrderPublicId:'order-b'}}],'order-a');
  assert.equal(first.entries.length,1);assert.equal(first.entries[0].quantity,10);assert.equal(first.entries[0].unitCost,0);assert.equal(first.entries[0].total,0);
  assert.equal(overlayOfflineExecution(first,[operation],'order-a').entries.length,1);assert.equal(data.entries.length,0);
});
test('cached quote details preserve manual items separately from material globals when reopening offline',async()=>{
  const {cachedQuoteDetail}=await vite.ssrLoadModule('/lib/offline-records.ts');
  const group={id:crypto.randomUUID(),title:'Corriente alterna',customerTitle:'Materiales AC',pricingMode:'cost',materials:[{id:crypto.randomUUID(),description:'Cable 4 mm2',quantity:20,unit:'m',unitCost:1000}]};
  const manual={name:'Mano de obra',quantity:1,unit:'gl',unitCost:5000,unitPrice:10000};
  const cached=cachedQuoteDetail({publicId:'quote-a',payloadJson:JSON.stringify({manualItems:[manual],items:[manual,{name:'Materiales AC',quantity:1,unit:'gl',unitPrice:20000}],materialGroups:[group]})});
  assert.equal(cached.manualItems.length,1);assert.equal(cached.materialGroups.length,1);assert.equal(cached.materialGroups[0].materials[0].quantity,20);assert.equal(cached.items.length,2);
});
