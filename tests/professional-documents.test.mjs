import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root,resolve:{alias:{'@':root}},server:{middlewareMode:true}});
after(async()=>{await vite.close();});
const hex=value=>Buffer.from(value,'latin1').toString('hex').toUpperCase();

test('price references normalize package quantities and explicitly leave unknown VAT unresolved',async()=>{
  const {CHILE_PRICE_REFERENCES,referenceUnitCost,referencesCsv}=await vite.ssrLoadModule('/lib/price-reference.ts');
  assert.equal(CHILE_PRICE_REFERENCES.length,196);assert.equal(new Set(CHILE_PRICE_REFERENCES.map(row=>row.code)).size,196);
  for(const row of CHILE_PRICE_REFERENCES){assert.ok(row.publishedPrice>0);assert.ok(row.packageQuantity>0);assert.match(row.sourceUrl,/^https:\/\//);}
  const input={publishedPrice:11900,packageQuantity:100,priceIncludesVat:true};assert.equal(referenceUnitCost(input),100);
  assert.equal(referenceUnitCost({...input,priceIncludesVat:null}),null);assert.equal(referenceUnitCost({...input,priceIncludesVat:null},'excluded'),119);
  const csv=referencesCsv([{...CHILE_PRICE_REFERENCES[0],name:'=HYPERLINK("bad")'}]);assert.match(csv,/'=HYPERLINK/);
});
test('classic commercial PDFs embed logo and fonts, paginate all scope and retain complete terms',async()=>{
  const {buildQuotePdf}=await vite.ssrLoadModule('/lib/pdf-documents.ts');
  const quote={number:'COT-001',revision:0,status:'Borrador',issueDate:'2026-10-20',currency:'CLP',clientName:'Cliente',project:'Trabajo',grossSubtotal:'100',netSubtotal:'100',tax:'19',total:'119',payloadJson:JSON.stringify({paymentTerms:'50% y 50%',deliveryTerms:'Condiciones de entrega completas',technicalValidation:'Validar equipo en terreno',notes:'NOTA_FINAL_VISIBLE'})};
  const items=Array.from({length:40},(_,i)=>({name:`Partida ${i+1}`,detail:'Desarrollo del alcance '.repeat(8)+(i===39?'ULTIMO_ALCANCE_VISIBLE':''),quantity:'1',unit:'gl',unitPrice:'100'}));
  const raw=Buffer.from(buildQuotePdf({company:{commercial_name:'SOLIS'},quote,items})).toString('latin1');
  assert.match(raw,/\/Subtype \/Image/);assert.match(raw,/\/FontFile2/);assert.match(raw,/\/Count [2-9]\d*/);
  for(const text of ['OFERTA ECONÓMICA','CONDICIONES COMERCIALES','Aceptación del cliente','NOTA_FINAL_VISIBLE','ULTIMO_ALCANCE_VISIBLE'])assert.match(raw,new RegExp(hex(text)));
  assert.doesNotMatch(raw,new RegExp(hex('COSTO INTERNO')));
});
