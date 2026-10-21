import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import * as React from 'react';
const root=fileURLToPath(new URL('..',import.meta.url));
globalThis.__metalconReact=React;
const originalFetch=globalThis.fetch;
const vite=await createServer({appType:'custom',configFile:false,root,server:{middlewareMode:true},resolve:{alias:[{find:/^react$/,replacement:'virtual:metalcon-hooks'},{find:'@/lib/offline-queue',replacement:'virtual:metalcon-offline'},{find:'@',replacement:root}]},plugins:[{name:'metalcon-ui-test',resolveId(id){if(id.startsWith('virtual:metalcon-'))return '\0'+id;},load(id){
  if(id==='\0virtual:metalcon-hooks')return Object.keys(React).filter(key=>/^[A-Za-z_$][\w$]*$/.test(key)&&!['default','useState','useMemo'].includes(key)).map(key=>`export const ${key}=globalThis.__metalconReact[${JSON.stringify(key)}];`).join(' ')+' export const useState=(...a)=>globalThis.__metalconHooks.useState(...a); export const useMemo=(...a)=>globalThis.__metalconHooks.useMemo(...a);';
  if(id==='\0virtual:metalcon-offline')return 'export const executeOrQueue=(...args)=>globalThis.__metalconSave(...args);';
}}]});
after(async()=>{await vite.close();globalThis.fetch=originalFetch;delete globalThis.__metalconReact;delete globalThis.__metalconHooks;delete globalThis.__metalconSave;});
const {MetalconPanel}=await vite.ssrLoadModule('/components/metalcon-panel.tsx');
const {METALCON_TEMPLATES,METALCON_REFERENCES}=await vite.ssrLoadModule('/lib/metalcon.ts');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function mount(props){
 const slots=[];let cursor=0,dirty=true,tree;
 const hooks={useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,next=>{const value=typeof next==='function'?next(slots[i].value):next;if(!Object.is(value,slots[i].value)){slots[i].value=value;dirty=true;}}];},useMemo(fn,deps){const i=cursor++;if(!slots[i]||deps.some((dep,j)=>!Object.is(dep,slots[i].deps[j])))slots[i]={deps,value:fn()};return slots[i].value;}};
 return {get tree(){return tree;},async flush(next){if(next){props={...props,...next};dirty=true;}for(let i=0;i<20;i++){if(dirty){dirty=false;cursor=0;globalThis.__metalconHooks=hooks;tree=MetalconPanel(props);}await tick();if(!dirty)return tree;}throw Error('Component did not settle');}};
}
function nodes(el){if(Array.isArray(el))return el.flatMap(nodes);if(!el||typeof el!=='object'||!el.props)return [];return [el,...nodes(el.props.children)];}
function text(el){if(Array.isArray(el))return el.map(text).join('');return el?.props?text(el.props.children):typeof el==='string'||typeof el==='number'?String(el):'';}
function find(tree,predicate){const node=nodes(tree).find(predicate);assert.ok(node,'Control not found');return node;}
const button=(tree,label)=>find(tree,node=>typeof node.props.onClick==='function'&&text(node).trim().startsWith(label));
const templateSelect=tree=>find(tree,node=>node.type==='select'&&text(node).includes('Elegir lista'));
const costField=(tree,code)=>find(tree,node=>node.props['aria-label']===`Costo neto ${code}`);
const props=()=>({online:true,canWrite:true,catalog:[],onImported(){},onQueued(){},onBundleSaved(){}});
async function open(app){await app.flush();button(app.tree,'Explorar Metalcon').props.onClick();await app.flush();}

test('Metalcon exploration is read-only and readers cannot submit prices or bundles',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected network mutation');};
 const app=mount({...props(),canWrite:false});await open(app);
 assert.ok(text(app.tree).includes('56 referencias'));assert.equal(calls,0);
 assert.ok(!nodes(app.tree).some(node=>typeof node.props.onClick==='function'&&text(node).includes('Validar antes')));
 assert.ok(!nodes(app.tree).some(node=>node.props['aria-label']?.startsWith('Costo neto')));
});

test('Metalcon entered prices survive background props and imports require preview then explicit confirmation',async()=>{
 const calls=[];let imported=0;
 globalThis.fetch=async(_url,options)=>{const input=JSON.parse(options.body);calls.push(input);return Response.json(input.action==='preview'?{preview:input.rows.map((r,i)=>({row:i+2,code:r.codigo,action:'add',errors:[],expectedState:'missing',netCost:r.costo,netPrice:r.venta})),summary:{added:input.rows.length,updated:0,skipped:0,invalid:0}}:{summary:{added:input.rows.length,updated:0,skipped:0,invalid:0}});};
 const app=mount({...props(),onImported(){imported++;}});await open(app);
 const selected=METALCON_TEMPLATES[1];templateSelect(app.tree).props.onChange({target:{value:selected.id}});await app.flush();
 for(const code of selected.codes){costField(app.tree,code).props.onChange({target:{value:'1000'}});await app.flush();}
 await app.flush({catalog:[],onImported(){imported++;}});assert.equal(costField(app.tree,selected.codes[0]).props.value,'1000');
 button(app.tree,'Validar antes').props.onClick();await app.flush();assert.equal(calls.length,1);assert.equal(calls[0].action,'preview');assert.equal(imported,0);
 costField(app.tree,selected.codes[0]).props.onChange({target:{value:'1500'}});await app.flush();assert.ok(!nodes(app.tree).some(node=>typeof node.props.onClick==='function'&&text(node).startsWith('Confirmar ')));
 button(app.tree,'Validar antes').props.onClick();await app.flush();button(app.tree,'Confirmar ').props.onClick();await app.flush();
 assert.equal(calls.length,3);assert.equal(calls[2].action,'commit');assert.equal(calls[2].mode,'add');assert.equal(calls[2].rows[0].costo,1500);assert.equal(imported,1);
});

test('Metalcon priced construction sets retain edited quantities and use the existing offline queue',async()=>{
 let queued=0,saved=0,payload;
 globalThis.__metalconSave=async(type,body)=>{assert.equal(type,'bundle.save');payload=body;return {queued:true};};
 const selected=METALCON_TEMPLATES[2];const catalog=selected.codes.map(code=>{const ref=METALCON_REFERENCES.find(ref=>ref.code===code);return {publicId:crypto.randomUUID(),code,name:ref.name,description:ref.scope,type:ref.type,unit:ref.unit,currency:'CLP',unitCost:'1000',unitPrice:'1300'};});
 const app=mount({...props(),online:false,catalog,onQueued(){queued++;},onBundleSaved(){saved++;}});await open(app);templateSelect(app.tree).props.onChange({target:{value:selected.id}});await app.flush();
 find(app.tree,node=>node.props['aria-label']===`Cantidad ${selected.codes[0]}`).props.onChange({target:{value:'8'}});await app.flush();
 assert.equal(button(app.tree,'Validar antes').props.disabled,true);button(app.tree,'Guardar conjunto de').props.onClick();await app.flush();
 assert.equal(queued,1);assert.equal(saved,0);assert.equal(payload.specialty,'Construcción');assert.equal(payload.lines[0].quantity,8);assert.ok(text(app.tree).includes('pendiente de sincronizar'));
});
