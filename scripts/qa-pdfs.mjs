import { createServer } from 'vite';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pdfCases, company, quote } from '../tests/fixtures/pdf-layout.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.resolve(process.argv[2] || path.join(root, 'work/pdf-qa'));
const vite = await createServer({ appType: 'custom', configFile: false, root, resolve: { alias: { '@': root } }, server: { middlewareMode: true } });
try {
  const generators = await vite.ssrLoadModule('/lib/pdf-documents.ts');
  await mkdir(output, { recursive: true });
  for (const [name, fn, input] of pdfCases) await writeFile(path.join(output, `${name}.pdf`), generators[fn](input));
  await writeFile(path.join(output, 'cotizacion-normal.pdf'), generators.buildQuotePdf({ company, quote: { ...quote, clientName: 'Industrial del Norte SpA', project: 'Modernización de tablero de bombas', payloadJson: JSON.stringify({ paymentTerms: '50% anticipo y 50% contra entrega.', deliveryTerms: '15 días hábiles desde el anticipo.', notes: 'Incluye pruebas, capacitación y entrega de documentación.' }) }, items: [{ name: 'Tablero de control y protecciones', detail: 'Suministro y montaje de tablero con PLC, HMI, protecciones eléctricas y pruebas de señales.', quantity: '1', unit: 'gl', unitPrice: '1200000' }, { name: 'Ingeniería y puesta en marcha', detail: 'Programación, puesta en servicio y capacitación de operador.', quantity: '1', unit: 'gl', unitPrice: '300000' }] }));
  const purchase = pdfCases.find(c => c[0] === 'compra')[2];
  await writeFile(path.join(output, 'compra-normal.pdf'), generators.buildPurchaseOrderPdf({ ...purchase, supplier: { name: 'Distribuidor Eléctrico SpA', taxId: '76.123.456-7', contactName: 'Encargado de ventas', paymentTerms: '30 días' }, purchase: { ...purchase.purchase, supplier: 'Distribuidor Eléctrico SpA', project: 'Modernización de tablero de bombas', notes: 'Despacho a bodega central. Confirmar disponibilidad antes de facturar.', approvedBy: 'Administrador SOLIS', approvalNotes: 'Presupuesto autorizado para este proyecto.' }, items: [{ description: 'Protección termomagnética 3P curva C, 32 A', quantity: '4', unit: 'un', unitCost: '25000', lineTotal: '100000' }, { description: 'Cable de cobre flexible 2,5 mm², rollo 100 m', quantity: '3', unit: 'rollo', unitCost: '300000', lineTotal: '900000' }] }));
  console.log(`10 PDF de prueba generados en ${output}`);
} finally { await vite.close(); }
