import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {fileURLToPath} from 'node:url';
import * as React from 'react';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('..',import.meta.url));globalThis.__v38React=React;
const originalFetch=globalThis.fetch;
const vite=await createServer({appType:'custom',configFile:false,root,server:{middlewareMode:true},resolve:{alias:[{find:/^react$/,replacement:'virtual:v38-hooks'},{find:'@/lib/offline-queue',replacement:'virtual:v38-offline'},{find:'@/components/catalog-import-panel',replacement:'virtual:v38-download'},{find:'@',replacement:root}]},plugins:[{name:'v38-ui',resolveId(id){if(id.startsWith('virtual:v38-'))return '\0'+id;},load(id){
 if(id==='\0virtual:v38-hooks')return Object.keys(React).filter(k=>/^[A-Za-z_$][\w$]*$/.test(k)&&!['default','useState','useEffect','useRef'].includes(k)).map(k=>`export const ${k}=globalThis.__v38React[${JSON.stringify(k)}];`).join(' ')+' export const useState=(...a)=>globalThis.__v38Hooks.useState(...a); export const useEffect=(...a)=>globalThis.__v38Hooks.useEffect(...a); export const useRef=(...a)=>globalThis.__v38Hooks.useRef(...a);';
 if(id==='\0virtual:v38-offline')return 'export const loadResource=async()=>globalThis.__v38Draft?{payload:structuredClone(globalThis.__v38Draft)}:null; export const cacheResource=async(key,value)=>{globalThis.__v38Draft=structuredClone(value);};';
 if(id==='\0virtual:v38-download')return 'export const downloadFile=(...a)=>globalThis.__v38Download(...a);';
}}]});
after(async()=>{await vite.close();globalThis.fetch=originalFetch;for(const key of ['__v38React','__v38Hooks','__v38Draft','__v38Download'])delete globalThis[key];});
const {QuoteWorkspace}=await vite.ssrLoadModule('/components/quote-workspace.tsx');
const {OperationsOverview}=await vite.ssrLoadModule('/components/operations-overview.tsx');
const {RecycleBin}=await vite.ssrLoadModule('/components/recycle-bin.tsx');
const {StockScanPanel}=await vite.ssrLoadModule('/components/stock-scan-panel.tsx');
const {materialQrValue}=await vite.ssrLoadModule('/lib/material-labels.ts');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function mount(Component,props){const slots=[];let cursor=0,dirty=true,tree,pending=[];const hooks={useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;dirty=true;}];},useRef(initial){const i=cursor++;if(!slots[i])slots[i]={current:initial};return slots[i];},useEffect(effect,deps){const i=cursor++,old=slots[i];if(!old||deps.some((dep,j)=>!Object.is(dep,old.deps[j]))){slots[i]={deps,cleanup:old?.cleanup};pending.push(()=>{slots[i].cleanup?.();slots[i].cleanup=effect();});}}};return{get tree(){return tree;},async flush(next){if(next){props={...props,...next};dirty=true;}for(let n=0;n<30;n++){if(dirty){dirty=false;cursor=0;pending=[];globalThis.__v38Hooks=hooks;tree=Component(props);for(const fn of pending)fn();}await tick();if(!dirty)return tree;}throw Error('Did not settle');},unmount(){for(const s of slots)s.cleanup?.();}};}
function nodes(el){if(Array.isArray(el))return el.flatMap(nodes);if(!el?.props)return[];return[el,...nodes(el.props.children)];}
function text(el){return Array.isArray(el)?el.map(text).join(''):el?.props?text(el.props.children):typeof el==='string'||typeof el==='number'?String(el):'';}
const find=(tree,fn)=>{const n=nodes(tree).find(fn);assert.ok(n,'Control not found');return n;};
const button=(tree,label)=>find(tree,n=>typeof n.props.onClick==='function'&&text(n).trim().startsWith(label));
const field=(tree,label)=>find(tree,n=>n.props['aria-label']===label);
const quote=(id,extra={})=>({publicId:id,rootPublicId:id,number:'COT-'+id,revision:0,clientPublicId:'client-1',clientName:'Empresa SpA',project:'Montaje eléctrico',issueDate:'2026-10-01',status:'Enviada',currency:'CLP',netSubtotal:'1000',total:'1190',marginPercent:'25',updatedAt:'2026-10-22T10:00:00Z',payloadJson:'{"validityDays":20}',locked:true,...extra});
const props=()=>({quotes:[quote('old',{rootPublicId:'root'}),quote('new',{rootPublicId:'root',revision:1,status:'Borrador',locked:false}),quote('usd',{currency:'USD'})],clients:[],query:'',online:true,onClearSearch(){}});

test('workspace filters persist across background updates and history is explicit; deletion appears only for editable drafts',async()=>{
 const app=mount(QuoteWorkspace,{...props(),onDelete(){},onManage(){}});await app.flush();assert.equal(button(app.tree,'Eliminar').props.disabled,undefined);
 field(app.tree,'Filtrar moneda').props.onChange({target:{value:'USD'}});await app.flush();assert.ok(!text(app.tree).includes('COT-new'));
 await app.flush({quotes:[...props().quotes]});assert.equal(field(app.tree,'Filtrar moneda').props.value,'USD');
 assert.ok(!nodes(app.tree).some(n=>typeof n.props.onClick==='function'&&text(n).trim()==='Eliminar'));
 button(app.tree,'Limpiar filtros').props.onClick();await app.flush();
 find(app.tree,n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});await app.flush();assert.ok(text(app.tree).includes('COT-old'));app.unmount();
});
test('follow-up resolves recipient by linked id, preserves user text and does not send or reveal internal values',async()=>{
 let sent=0;globalThis.fetch=async()=>{sent++;throw Error('Unexpected send');};
 const row=quote('sent',{internalCost:'SECRET-COST'});const app=mount(QuoteWorkspace,{...props(),quotes:[row],clients:[{publicId:'wrong',name:'Empresa SpA',email:'wrong@example.cl',contactName:'Otro',phone:'+56911111111'},{publicId:'client-1',name:'Empresa SpA',email:'right@example.cl',contactName:'Ana',phone:'+56922222222'}]});await app.flush();button(app.tree,'Seguimiento').props.onClick();await app.flush();
 const message=field(app.tree,'Mensaje de seguimiento');assert.ok(message.props.value.includes('Ana'));assert.ok(!message.props.value.includes('SECRET'));
 assert.ok(find(app.tree,n=>n.type==='a'&&text(n)==='Preparar correo').props.href.includes('right%40example.cl'));assert.ok(find(app.tree,n=>n.type==='a'&&text(n)==='Abrir WhatsApp').props.href.includes('56922222222'));
 message.props.onChange({target:{value:'Mensaje revisado'}});await app.flush({online:false});assert.equal(field(app.tree,'Mensaje de seguimiento').props.value,'Mensaje revisado');assert.ok(!nodes(app.tree).some(n=>n.type==='a'&&text(n)==='Abrir WhatsApp'));assert.equal(sent,0);app.unmount();
});
test('operations panel keeps commercial amounts and identifiers out of a technician view',()=>{
 const el=OperationsOverview({quotes:[quote('SECRET-OFFER')],orders:[],canReadQuotes:false,canReadOrders:true,onQuotes(){},onOrders(){}});
 assert.ok(!text(el).includes('SECRET-OFFER'));assert.ok(!text(el).includes('Cartera por moneda'));assert.ok(text(el).includes('trabajos vencidos'));
});
const item={publicId:'0740049e-9aa0-4eee-9469-191d5fac0d70',code:'MAT-001',name:'Cable',unit:'m',unitCost:1000,currency:'CLP'};
const warehouse={publicId:'0740049e-9aa0-4eee-9469-191d5fac0d71',name:'Bodega',active:true,isDefault:true};
const stockProps=()=>({items:[item],warehouses:[warehouse],online:false,onReceived(){}});
async function scanAndAdd(app){find(app.tree,n=>typeof n.props.onCode==='function').props.onCode(materialQrValue(item));await app.flush();field(app.tree,'Cantidad de entrada').props.onChange({target:{value:'2.5'}});await app.flush();button(app.tree,'Agregar al lote').props.onClick();await app.flush();}
test('offline scan selects exact material and stores a draft without moving stock; labels download contains no cost',async()=>{
 globalThis.__v38Draft=null;let writes=0,download;globalThis.fetch=async()=>{writes++;throw Error('Offline must not write');};globalThis.__v38Download=(...args)=>{download=args;};
 const app=mount(StockScanPanel,stockProps());await app.flush();await scanAndAdd(app);assert.equal(globalThis.__v38Draft[0].quantity,2.5);assert.equal(writes,0);assert.equal(button(app.tree,'Confirmar entradas').props.disabled,true);
 button(app.tree,'Descargar etiquetas').props.onClick();assert.ok(download[0].includes('SOLIS'));assert.ok(!download[0].includes('1000 CLP'));app.unmount();
});
test('intake blocks repeated submit clicks and a retry reuses the receipt id after a lost response',async()=>{
 globalThis.__v38Draft=null;let calls=[],received=0,fail=true;globalThis.fetch=async(_url,options)=>{calls.push(JSON.parse(options.body));if(fail)throw Error('Respuesta no recibida; reintente la misma entrada');return Response.json({ok:true,replayed:true});};
 const app=mount(StockScanPanel,{...stockProps(),online:true,onReceived(){received++;}});await app.flush();await scanAndAdd(app);
 const confirm=button(app.tree,'Confirmar entradas');confirm.props.onClick();confirm.props.onClick();await app.flush();assert.equal(calls.length,1);assert.equal(globalThis.__v38Draft[0].state,'error');const id=calls[0].receiptPublicId;app.unmount();
 fail=false;const reopened=mount(StockScanPanel,{...stockProps(),online:true,onReceived(){received++;}});await reopened.flush();button(reopened.tree,'Confirmar entradas').props.onClick();await reopened.flush();assert.equal(calls.length,2);assert.equal(calls[1].receiptPublicId,id);assert.equal(globalThis.__v38Draft[0].state,'done');assert.equal(received,1);reopened.unmount();
});

test('trash confirmation and restore send the server revision guard and block duplicate clicks',async()=>{
 const target={kind:'quote',publicId:'quote-trash-id',title:'COT-TRASH',updatedAt:'2026-10-22T10:00:00Z'};let writes=[],changed=0;
 globalThis.fetch=async(_url,options)=>{if(options?.method==='POST'){writes.push(JSON.parse(options.body));return Response.json({ok:true});}return Response.json({records:[{publicId:target.publicId,title:target.title,description:'Proyecto',updatedAt:'2026-10-22T11:00:00Z'}]});};
 const app=mount(RecycleBin,{kind:'quote',online:true,target,onClose(){},onChanged(){changed++;}});await app.flush();const confirm=button(app.tree,'Enviar a papelera');confirm.props.onClick();confirm.props.onClick();await app.flush();
 assert.equal(writes.length,1);assert.deepEqual(writes[0],{kind:'quote',action:'archive',publicId:target.publicId,expectedUpdatedAt:target.updatedAt});assert.equal(changed,1);
 await app.flush({target:null});button(app.tree,'Papelera de').props.onClick();await app.flush();button(app.tree,'Restaurar').props.onClick();await app.flush();
 assert.equal(writes[1].expectedUpdatedAt,'2026-10-22T11:00:00Z');assert.equal(writes[1].action,'restore');await app.flush({online:false});assert.equal(button(app.tree,'Papelera de').props.disabled,true);app.unmount();
});
