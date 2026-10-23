import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ appType: 'custom', configFile: false, root, resolve: { alias: { '@': root } }, server: { middlewareMode: true } });
after(() => vite.close());
const { buildQuotePdf } = await vite.ssrLoadModule('/lib/pdf-documents.ts');
const { PDF_FONTS } = await vite.ssrLoadModule('/lib/pdf-fonts.ts');
const company = { commercial_name: 'SOLIS Ingeniería y Servicios SpA', representative: 'Equipo comercial SOLIS' };
const items = [
 { name: 'Mano de obra', detail: 'Instalación y conexionado de paneles, baterías, inversor y puesta en marcha.', quantity: '1', unit: 'gl', unitPrice: '700000' },
 { name: 'Mano de obra estructura Metalcon', detail: '', quantity: '1', unit: 'gl', unitPrice: '250000' },
 { name: 'Transporte a domicilio', detail: '', quantity: '1', unit: 'gl', unitPrice: '170000' },
 { name: 'Canalización y cableado AC', detail: '', quantity: '1', unit: 'gl', unitPrice: '218750' },
 { name: 'Estructura metálica Metalcon', detail: '', quantity: '1', unit: 'gl', unitPrice: '284753' },
];
const quote = { number: 'SOLIS-DEMO-001', revision: 0, status: 'Muestra', issueDate: '2026-10-22', currency: 'CLP', clientName: 'Cliente de ejemplo', project: 'Instalación y puesta en marcha de sistema fotovoltaico', grossSubtotal: '1623503', netSubtotal: '1623503', tax: '308466', total: '1931969', payloadJson: JSON.stringify({ validityDays: 20, paymentTerms: '50% de anticipo y saldo contra entrega.', deliveryTerms: '15 días hábiles desde el anticipo.', notes: 'Demostración de formato. Valores de ejemplo.' }) };
function blocks(raw) {
 return [...raw.matchAll(/BT \/F([12]) ([\d.]+) Tf 1 0 0 1 ([\d.-]+) ([\d.-]+) Tm <([A-F0-9]*)> Tj ET/g)].map(([, font, size, x, y, hex]) => {
  const bytes = Buffer.from(hex, 'hex'); const widths = PDF_FONTS[Number(font) - 1].widths;
  return { text: bytes.toString('latin1'), x: Number(x), y: Number(y), width: [...bytes].reduce((n, b) => n + (widths[Math.max(0, b - 32)] || 600), 0) / 1000 * Number(size) };
 });
}
test('five-item commercial quote follows blue reference tables, compact totals and signatures on one page', () => {
 const raw = Buffer.from(buildQuotePdf({ company, quote, items })).toString('latin1');
 assert.match(raw, /\/Type \/Pages \/Kids \[[^\]]+\] \/Count 1/);
 const fills = [...raw.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) rg ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) re f/g)];
 assert.ok(fills.some(([,r,,b,,,width])=>+b>0.7&&+r<0.1&&+width<220), 'Economic header uses the reference blue'); assert.ok(fills.some(([,r,,b])=>+r>0.9&&+b>+r), 'Metadata and summary use pale blue');
 const text = blocks(raw); const subtotal = text.find(b => b.text === 'Subtotal neto'), total = text.find(b => b.text === 'TOTAL IVA INCLUIDO');
 assert.ok(subtotal.x > 200 && total.x > 200, 'Summary belongs on the right');
 assert.ok(total.y < subtotal.y); assert.ok(text.some(b => b.text.includes('Aceptación del cliente')));
 assert.ok(text.some(b => b.text.includes('1.931.969'))); assert.ok(text.some(b => b.text.includes('308.466')));
 const finalFill = fills.find(([,r,,,x,,width])=>+r<0.9&&+r>0.8&&+x>300&&+width<130); assert.ok(finalFill, 'Only the compact total row has the stronger blue fill'); assert.ok(!text.some(b=>b.text==='Descuento'||b.text==='Subtotal bruto'), 'Zero-discount summaries show only net, tax and total');
});
test('large amounts in all supported currencies stay inside page margins without overlapping summary labels', () => {
 for (const currency of ['CLP', 'USD', 'EUR', 'UF']) {
  const raw = Buffer.from(buildQuotePdf({ company, quote: { ...quote, currency, grossSubtotal: '999999999999999', netSubtotal: '900000000000000', tax: '171000000000000', total: '1071000000000000' }, items })).toString('latin1');
  const text = blocks(raw); for (const b of text) assert.ok(b.x >= 41 && b.x + b.width <= 554.3, `${currency}: ${b.text}`);
  const summaryStart = text.findIndex(b => b.text === 'Subtotal bruto'), end = text.findIndex(b => b.text === 'CONDICIONES COMERCIALES');
  const summary = text.slice(summaryStart, end);
  for (const a of summary) for (const b of summary) if (a !== b && Math.abs(a.y - b.y) < 5) assert.ok(Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) <= 0.8, `${currency}: overlapping summary`);
 }
});

test('reference metadata, editable payment fields and actual revision control are included without hardcoded accounts', () => {
 const bank={bank_account_holder:'Titular de prueba SpA',bank_account_tax_id:'76.123.456-7',bank_name:'Banco de ejemplo',bank_account_type:'Corriente',bank_account_number:'00123456789',bank_notification_email:'pagos@example.test',representative_title:'Ingeniero'};
 const input={company:{...company,...bank},quote:{...quote,number:'COT-REF-001',revision:3,status:'Enviada',locked:true},items,client:{name:'Cliente de prueba',taxId:'77.123.456-7',contactName:'Contacto de ejemplo',phone:'+56911111111',email:'cliente@example.test',address:'Dirección de prueba 123'}};
 const raw=Buffer.from(buildQuotePdf(input)).toString('latin1'), words=blocks(raw);
 for(const expected of ['R03','Versión congelada','Teléfono','Correo','Dirección','DATOS DE PAGO',...Object.values(bank)])assert.ok(words.some(b=>b.text===expected),'Missing '+expected);
 const account=words.find(b=>b.text===bank.bank_account_number);assert.ok(account,'Leading zeros are retained');
 const cleared=blocks(Buffer.from(buildQuotePdf({...input,company:{...company,bank:'Legacy bank',bank_name:'',bank_account_holder:'',bank_account_type:'',bank_account_number:''}})).toString('latin1'));
 assert.ok(!cleared.some(b=>b.text==='DATOS DE PAGO'||b.text==='Legacy bank'));
 const draft=blocks(Buffer.from(buildQuotePdf({company,quote:{...quote,status:'Borrador'},items})).toString('latin1'));
 assert.ok(draft.some(b=>b.text==='Borrador editable'));
});
