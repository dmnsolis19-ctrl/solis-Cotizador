import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root,resolve:{alias:{'@':root}},server:{middlewareMode:true}});
after(()=>vite.close());
const lib=await vite.ssrLoadModule('/lib/commercial-overview.ts');
const {parseCsv}=await vite.ssrLoadModule('/lib/catalog-import.ts');
const q=(id,extra={})=>({publicId:id,rootPublicId:id,number:'COT-'+id,revision:0,clientPublicId:'c-1',clientName:'Cliente eléctrico',project:'Automatización de bombas',issueDate:'2026-10-01',status:'Enviada',currency:'CLP',netSubtotal:'100000',total:'119000',updatedAt:'2026-10-01T12:00:00Z',payloadJson:JSON.stringify({validityDays:20}),...extra});

test('latest versions are deterministic, independent per root and never mutate their source',()=>{
 const records=[q('old',{rootPublicId:'root',revision:0}),q('new',{rootPublicId:'root',revision:1,updatedAt:'2026-10-02T10:00:00Z'}),q('other',{rootPublicId:''}),q('tie',{rootPublicId:'root',revision:1,updatedAt:'2026-10-03T10:00:00Z'})];
 const before=structuredClone(records);const result=lib.latestQuoteVersions(records);
 assert.deepEqual(new Set(result.map(row=>row.publicId)),new Set(['tie','other']));assert.deepEqual(records,before);
 assert.deepEqual(lib.latestQuoteVersions([...records].reverse()).map(row=>row.publicId),result.map(row=>row.publicId));
});
test('overview separates currencies and counts only latest proposals; approval in an older revision is not sold again',()=>{
 const records=[q('old',{rootPublicId:'r',status:'Aprobada'}),q('next',{rootPublicId:'r',revision:1,status:'Borrador',netSubtotal:'200000'}),q('usd',{currency:'USD',netSubtotal:'100.25',status:'Aprobada'}),q('uf',{currency:'UF',netSubtotal:'4.1234'}),q('void',{status:'Anulada'}),q('bad',{netSubtotal:'NaN'}),q('pending',{status:'Pendiente de sincronizar'})];
 const result=lib.commercialOverview(records,'2026-10-22');
 assert.equal(result.latest.length,6);assert.equal(result.invalidAmounts,1);assert.equal(result.queued.length,1);
 assert.deepEqual(result.amounts.find(row=>row.currency==='CLP'),{currency:'CLP',count:2,proposedNet:300000,approvedNet:0});
 assert.equal(result.amounts.find(row=>row.currency==='USD').approvedNet,100.25);assert.equal(result.amounts.find(row=>row.currency==='UF').proposedNet,4.1234);
});
test('validity respects calendar days, expiry-day inclusivity, leap years and missing metadata',()=>{
 assert.equal(lib.quoteValidity(q('one'),'2026-10-21').state,'expiring');assert.equal(lib.quoteValidity(q('one'),'2026-10-21').daysRemaining,0);
 assert.equal(lib.quoteValidity(q('one'),'2026-10-22').state,'expired');
 assert.equal(lib.quoteValidity(q('leap',{issueDate:'2028-02-28',payloadJson:'{"validity_days":1}'}),'2028-02-29').expiresOn,'2028-02-29');
 for(const payloadJson of ['{}','null','[]','bad','{"validityDays":0}','{"validityDays":366}','{"validityDays":""}']) assert.equal(lib.quoteValidity(q('one',{payloadJson}),'2026-10-22').state,'unknown');
 assert.equal(lib.quoteValidity(q('date',{issueDate:'2026-02-30'}),'2026-10-22').state,'unknown');
 assert.equal(lib.quoteValidity(q('approved',{status:'Aprobada'}),'2026-10-22').state,'not_applicable');
 assert.equal(lib.quoteValidity(q('draft',{status:'Borrador'}),'2026-10-22').state,'not_applicable');
});
test('search combines words in any order and ignores accents; filters, range and history compose correctly',()=>{
 const records=[q('old',{rootPublicId:'root'}),q('new',{rootPublicId:'root',revision:1,currency:'USD'}),q('another',{clientPublicId:'c-2',issueDate:'2026-09-01'})];
 assert.equal(lib.matchesCommercialSearch('Automatización eléctrica de bombas','BOMBAS automatizacion'),true);
 assert.equal(lib.matchesCommercialSearch('Bombas','bombas solar'),false);
 assert.deepEqual(lib.filterCommercialQuotes(records,{...lib.EMPTY_QUOTE_FILTERS,currency:'USD',clientId:'c-1',validity:'expired'},'electrico bombas','2026-10-22').map(row=>row.publicId),['new']);
 assert.equal(lib.filterCommercialQuotes(records,{...lib.EMPTY_QUOTE_FILTERS,history:true},'','2026-10-22').length,3);
 assert.equal(lib.filterCommercialQuotes(records,{...lib.EMPTY_QUOTE_FILTERS,from:'2026-11-01',to:'2026-10-01'}).length,0);
 assert.equal(lib.filterCommercialQuotes(records,{...lib.EMPTY_QUOTE_FILTERS,from:'2026-10-01',to:'2026-10-01'}).length,1);
});
test('sorting never ranks different currencies by amount and filtered export escapes spreadsheet formulas without internal fields',()=>{
 const records=[q('first',{issueDate:'2026-10-20',total:'10'}),q('usd',{currency:'USD',issueDate:'2026-10-01',total:'999999'}),q('second',{issueDate:'2026-10-02',total:'20'})];
 assert.deepEqual(lib.filterCommercialQuotes(records,{...lib.EMPTY_QUOTE_FILTERS,sort:'amount'}).map(row=>row.publicId),['first','second','usd']);
 assert.deepEqual(lib.filterCommercialQuotes(records,{...lib.EMPTY_QUOTE_FILTERS,currency:'CLP',sort:'amount'}).map(row=>row.publicId),['second','first']);
 const csv=lib.commercialQuotesCsv([q('export',{clientName:'=HYPERLINK("x")',project:'Trabajo;\nNuevo',internalCost:'SECRET-999',marginPercent:'SECRET-123'})],'2026-10-22');
 const rows=parseCsv(csv);assert.equal(rows.length,2);assert.equal(rows[1][2],'\'=HYPERLINK("x")');assert.equal(rows[1][3],'Trabajo;\nNuevo');assert.equal(rows[1][6],'CLP');assert.ok(!csv.includes('SECRET'));
});
test('follow-up uses only the commercial identity and scope, with no hidden price or cost data',()=>{
 const message=lib.followupMessage(q('follow',{internalCost:'SECRET-999',estimatedProfit:'SECRET-123'}),'Ana Pérez');
 assert.ok(message.includes('Ana Pérez'));assert.ok(message.includes('COT-follow'));assert.ok(message.includes('Automatización de bombas'));assert.ok(!message.includes('SECRET'));assert.ok(!message.includes('119000'));
});
