import assert from 'node:assert/strict';
import test, {after} from 'node:test';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root,resolve:{alias:{'@':root}},server:{middlewareMode:true}});after(()=>vite.close());
const labels=await vite.ssrLoadModule('/lib/material-labels.ts');
const {default:decode}=await vite.ssrLoadModule('/vendor/jsqr.mjs');
const material={publicId:'0740049e-9aa0-4eee-9469-191d5fac0d70',code:'MAT-001',name:'Cable de cobre 2,5 mm²',unit:'m'};
test('generated QR raster decodes through the actual offline reader, including quiet zone and Unicode',()=>{
 for(const value of [labels.materialQrValue(material),'Material eléctrico 2,5 mm² · Chile']){
  const svg=labels.qrSvg(value),modules=Number(/viewBox="0 0 (\d+) /.exec(svg)[1]),scale=7,size=modules*scale;
  const pixels=new Uint8ClampedArray(size*size*4).fill(255);
  for(const [,x,y] of svg.matchAll(/M(\d+),(\d+)h1v1h-1z/g))for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const p=((Number(y)*scale+dy)*size+Number(x)*scale+dx)*4;pixels[p]=pixels[p+1]=pixels[p+2]=0;}
  const result=decode(pixels,size,size);assert.equal(result?.data,value);
 }
});
test('Code 128 uses published start, weighted checksum and stop symbols and printable SVG',()=>{
 assert.deepEqual(labels.code128Values('ABC'),[104,33,34,35,1,106]);
 assert.throws(()=>labels.code128Values('ELÉCTRICO'));assert.throws(()=>labels.code128Values(''));
 const svg=labels.barcodeSvg('MAT-001');assert.ok(svg.includes('shape-rendering="crispEdges"'));assert.ok(svg.includes('MAT-001'));assert.ok(!svg.includes('http://evil'));
});
test('material resolution rejects ambiguous and unknown barcodes; stable QR still finds the exact material',()=>{
 const other={...material,publicId:'other-unique-id'};
 assert.throws(()=>labels.findScannedMaterial([material,other],'MAT-001'),/repetidos/);
 assert.equal(labels.findScannedMaterial([material,other],labels.materialQrValue(material)).publicId,material.publicId);
 assert.equal(labels.findScannedMaterial([material],' mat-001 ').publicId,material.publicId);
 assert.throws(()=>labels.findScannedMaterial([material],'https://example.com/'),/No se encontró/);
});
test('print labels escape untrusted names and contain no internal cost or selling price',()=>{
 const html=labels.materialLabelHtml([{...material,name:'<script>alert(1)</script>',unit:'m" onload="bad',unitCost:'SECRET-COST',unitPrice:'SECRET-PRICE'}],'qr');
 assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('SECRET-'));
 assert.throws(()=>labels.materialLabelHtml([],'qr'));assert.throws(()=>labels.materialLabelHtml(Array(101).fill(material),'qr'));
});
