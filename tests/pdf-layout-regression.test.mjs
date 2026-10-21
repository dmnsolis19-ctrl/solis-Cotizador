import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { pdfCases } from './fixtures/pdf-layout.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ appType: 'custom', configFile: false, root, resolve: { alias: { '@': root } }, server: { middlewareMode: true } });
after(() => vite.close());
const generators = await vite.ssrLoadModule('/lib/pdf-documents.ts');
const { PDF_FONTS } = await vite.ssrLoadModule('/lib/pdf-fonts.ts');
for (const [name, generator, input, markers] of pdfCases) test(`${name}: retains complete long fields, all records, and text inside page margins`, () => {
  const raw = Buffer.from(generators[generator](input)).toString('latin1');
  const streams = [...raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(match => match[1]).filter(stream => stream.includes(' Tj ET'));
  assert.ok(streams.length >= 2, 'Long document must paginate');
  const text = streams.flatMap(stream => [...stream.matchAll(/<([A-F0-9]*)> Tj ET/g)].map(match => Buffer.from(match[1], 'hex').toString('latin1'))).join(' ');
  for (const marker of markers) assert.ok(text.includes(marker), `${name}: missing end of ${marker}`);
  for (const stream of streams) {
    const blocks = [...stream.matchAll(/BT \/F([12]) ([\d.]+) Tf 1 0 0 1 ([\d.-]+) ([\d.-]+) Tm <([A-F0-9]*)> Tj ET/g)].map(match => {
      const [, fontIndex, sizeText, xText, yText, encoded] = match;
      const size = Number(sizeText), x = Number(xText), y = Number(yText), font = PDF_FONTS[Number(fontIndex) - 1];
      const bytes = Buffer.from(encoded, 'hex');
      const width = [...bytes].reduce((sum, code) => sum + (font.widths[Math.max(0, code - 32)] || 600), 0) / 1000 * size;
      assert.ok(x >= 41 && x + width <= 554.3, `${name}: text exceeds horizontal margins: ${bytes.toString('latin1')}`);
      assert.ok(y >= 14 && y <= 811, `${name}: text exceeds vertical margins: ${y}`);
      return { x, y, width, size, text: bytes.toString('latin1') };
    }).filter(block => block.width > 0);
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j];
      // Distinct lines and columns need visible separation; allow glyph side bearings.
      const sameBand = Math.abs(a.y - b.y) < Math.min(a.size, b.size) * 0.75;
      const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      assert.ok(!sameBand || overlap <= 0.8, `${name}: overlapping text: ${a.text} / ${b.text}`);
    }
  }
});
