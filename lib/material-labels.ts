import { qrcodegen } from '@/vendor/qrcodegen';
import { BARS } from '@/vendor/code128-constants';
export type LabeledMaterial={publicId:string;code:string;name:string;unit:string};
const escape=(text:string)=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function materialQrValue(item:LabeledMaterial){return `SOLIS-MAT:${item.publicId}`;}
export function findScannedMaterial<T extends LabeledMaterial>(items:T[],value:string){
 const text=value.trim();if(!text||text.length>200)throw Error('El código está vacío o es demasiado largo.');
 const found=text.startsWith('SOLIS-MAT:')?items.filter(item=>item.publicId===text.slice(10)):items.filter(item=>item.code.trim().toLocaleUpperCase('es-CL')===text.toLocaleUpperCase('es-CL'));
 if(found.length!==1)throw Error(found.length?'Hay códigos repetidos en la biblioteca. Use el QR del material o corrija sus códigos.':'No se encontró este material en la biblioteca cargada.');return found[0];
}
export function qrSvg(text:string){
 const qr=qrcodegen.QrCode.encodeText(text,qrcodegen.QrCode.Ecc.MEDIUM);const border=4,size=qr.size+border*2;let path='';
 for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++)if(qr.getModule(x,y))path+=`M${x+border},${y+border}h1v1h-1z`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="240" height="240" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="black"/></svg>`;
}
export function code128Values(text:string){
 if(!/^[\x20-\x7e]{1,48}$/.test(text))throw Error('Code 128 admite códigos de 1 a 48 caracteres ASCII. Para otros códigos use QR.');
 const values=[104,...Array.from(text,char=>char.charCodeAt(0)-32)];const check=values.reduce((sum,value,i)=>sum+value*(i||1),0)%103;return [...values,check,106];
}
export function barcodeSvg(text:string){
 const bits=code128Values(text).map(value=>String(BARS[value])).join('');const quiet=10,width=bits.length+quiet*2;let path='';
 for(let i=0;i<bits.length;i++)if(bits[i]==='1')path+=`M${i+quiet},0h1v55h-1z`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 70" width="${width*2}" height="140" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="black"/><text x="${width/2}" y="67" text-anchor="middle" font-family="monospace" font-size="8">${escape(text)}</text></svg>`;
}
export function materialLabelHtml(items:LabeledMaterial[],format:'qr'|'barcode'){
 if(!items.length||items.length>100)throw Error('Seleccione entre 1 y 100 materiales.');
 return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Etiquetas de materiales SOLIS</title><style>body{font-family:Arial,sans-serif;margin:20px;color:#111}.labels.barcode{grid-template-columns:minmax(0,1fr)}.labels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.label{border:1px solid #ccc;border-radius:6px;padding:10px;text-align:center;break-inside:avoid;overflow-wrap:anywhere}.label svg{max-width:100%;height:auto}.label.qr svg{width:140px;height:140px}.label p{font-size:11px;margin:5px}h1{font-size:18px}@media(max-width:650px){.labels{grid-template-columns:repeat(2,minmax(0,1fr))}}@media print{body{margin:0}h1,.instructions{display:none}.labels{grid-template-columns:repeat(3,minmax(0,1fr))}}</style></head><body><h1>Etiquetas de materiales SOLIS</h1><p class="instructions">Imprima desde el menú del navegador, con escala 100%. Verifique una etiqueta con el lector antes de imprimir el lote. Las etiquetas no incluyen costos ni precios.</p><div class="labels ${format}">${items.map(item=>`<article class="label ${format}">${format==='qr'?qrSvg(materialQrValue(item)):barcodeSvg(item.code)}<p><strong>${escape(item.code)}</strong></p><p>${escape(item.name)}</p><p>Unidad: ${escape(item.unit)}</p></article>`).join('')}</div></body></html>`;
}
