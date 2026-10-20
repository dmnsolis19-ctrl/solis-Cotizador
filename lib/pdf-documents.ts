import type { SupplierMaterial } from "./material-groups";
import { accountingText, type AccountingPacket } from "./accounting";
import type { OrderMaterialsData } from "./order-materials";
import { PDF_FONTS } from "./pdf-fonts";
import { DEFAULT_PDF_LOGO } from "./pdf-logo";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const AMBER = [0.02, 0.40, 0.84] as const;
const BLUE = AMBER;
const PALE_BLUE = [0.91, 0.95, 0.99] as const;
const WHITE = [1, 1, 1] as const;
const NAVY = [0.06, 0.09, 0.16] as const;
const SLATE = [0.28, 0.33, 0.41] as const;
const LIGHT = [0.95, 0.96, 0.97] as const;

type PdfPage = { commands: string[] };
type Color = readonly [number, number, number];

export function buildSupplierInquiryPdf(input: { company: CompanyData; number: string; project: string; issueDate: string; rows: SupplierMaterial[] }) {
  const pdf = new PdfDocument();
  let page: PdfPage;
  let y = 0;
  const newPage = () => {
    page = pdf.addPage();
    drawHeader(pdf, page, input.company, "SOLICITUD DE PRECIOS", input.number, input.issueDate);
    y = PAGE_HEIGHT - 150;
  };
  const line = (text: string, bold = false) => {
    if (y < 65) newPage();
    pdf.text(page, text, MARGIN + 6, y, 8.5, bold);
    y -= 12;
  };
  const paragraph = (text: string, bold = false) => { for (const textLine of wrapText(text, PAGE_WIDTH - MARGIN * 2 - 12, 8.5)) line(textLine, bold); };
  newPage();
  paragraph(`Proyecto: ${input.project}`, true);
  paragraph("Solicitamos precio unitario neto, moneda, impuestos, disponibilidad, plazo de entrega, despacho, garantía y vigencia de su oferta.");
  paragraph("Documento para solicitar una oferta. No constituye una orden de compra.");
  y -= 12;
  input.rows.forEach((item, index) => {
    if (y < 140) newPage();
    paragraph(`${index + 1}. ${item.code ? item.code + " - " : ""}${item.description}`, true);
    paragraph(`Cantidad: ${item.quantity} ${item.unit}`);
    if (item.brand) paragraph(`Marca / modelo: ${item.brand}`);
    if (item.specification) paragraph(`Especificación: ${item.specification}`);
    paragraph(`Lista(s): ${item.lists.join(" / ")}`);
    paragraph("Precio unitario: __________________  Plazo: __________________");
    y -= 6;
    pdf.line(page, MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y -= 18;
  });
  pdf.pages.forEach((currentPage, index) => drawFooter(pdf, currentPage, input.company, index + 1, pdf.pages.length));
  return pdf.toBytes();
}

export type CompanyData = Record<string, unknown>;
export type ClientPdfData = { name: string; taxId?: string; contactName?: string; email?: string; phone?: string; address?: string };
export type QuotePdfItem = { name: string; detail: string; quantity: string; unit: string; unitPrice: string };
export type QuotePdfData = {
  number: string; revision: number; status: string; issueDate: string; currency: string;
  clientName: string; project: string; grossSubtotal: string; netSubtotal: string; tax: string; total: string;
  lockedAt?: string; approvedAt?: string; approvedBy?: string; approvalNotes?: string; payloadJson: string;
};
export type WorkOrderPdfData = {
  number: string; createdDate: string; clientName: string; project: string; status: string;
  responsible: string; plannedStart: string; plannedEnd: string; notes: string; currency: string; approvedSale: string;
  priority?: string; dueDate?: string;
};
export type SupplierPdfData = {
  code: string; name: string; taxId: string; contactName: string; email: string; phone: string;
  address: string; paymentTerms: string; currency: string;
};
export type PurchasePdfData = {
  number: string; status: string; currency: string; supplier: string; notes: string; createdAt: string;
  dispatchNet?: string; subtotal: string; discountAmount: string; discountPercent: string; netSubtotal: string;
  taxAmount: string; taxPercent: string; total: string; approvedBy: string; approvedAt: string;
  approvalNotes: string; orderedBy: string; orderedAt: string; workOrderNumber?: string; project?: string;
};
export type PurchasePdfItem = {
  description: string; quantity: string; unit: string; unitCost: string; lineTotal: string; receivedQuantity: string;
};
export type WorkOrderExecutionPdfData = {
  activities: Array<{ title: string; required: boolean; completed: boolean }>;
  entries: Array<{ type: string; description: string; quantity: number; unit: string; entryDate: string }>;
  evidence: Array<{ caption: string; createdAt: string }>;
  signoff?: { customerName: string; customerRole: string; signedAt: string; notes: string };
  materialRequests?: Array<{ status: string; urgency: string; neededDate: string; activityTitle: string; requestedBy: string; items: Array<{ description: string; quantity: number; unit: string }> }>;
};
export type ClosurePdfData = {
  number: string; clientName: string; project: string; currency: string; closedAt: string; closedBy: string;
  closureNotes: string; sale: number; budgetedCost: number; actualCost: number; actualProfit: number;
  actualMarginPercent: number; budgetVariance: number; breakdown: Record<string, number>;
  counts: { activities: number; signoffs: number; materialRequests: number; purchases: number };
};
export type CollectionPdfData = {
  number: string; clientName: string; project: string; concept: string; status: string; currency: string;
  issueDate: string; dueDate: string; netAmount: number; taxPercent: number; taxAmount: number; totalAmount: number;
  paidAmount: number; balance: number; notes: string;
  payments: Array<{ paymentDate: string; amount: number; method: string; reference: string }>;
};

const replacements: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87,
  "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91,
  "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98,
  "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

function cleanText(value: unknown) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

function winAnsiHex(value: unknown) {
  const bytes: number[] = [];
  for (const char of cleanText(value)) {
    const code = char.codePointAt(0) ?? 63;
    if (code <= 0xff) bytes.push(code);
    else bytes.push(replacements[char] ?? 63);
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function approximateWidth(value: string, size: number, bold = false) {
  const widths = PDF_FONTS[bold ? 1 : 0].widths;
  let units = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 63;
    const byte = code <= 0xff ? code : replacements[char] ?? 63;
    units += widths[Math.max(0, byte - 32)] || 600;
  }
  return units / 1000 * size;
}

function wrapText(value: unknown, maxWidth: number, size: number, bold = false) {
  const words = cleanText(value).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (approximateWidth(candidate, size, bold) <= maxWidth) current = candidate;
    else {
      if (current) lines.push(current);
      if (approximateWidth(word, size, bold) <= maxWidth) current = word;
      else {
        let fragment = "";
        for (const char of word) {
          if (fragment && approximateWidth(fragment + char, size, bold) > maxWidth) { lines.push(fragment); fragment = ""; }
          fragment += char;
        }
        current = fragment;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

class PdfDocument {
  pages: PdfPage[] = [];
  private imageHex = "";
  private imageWidth = 1080;
  private imageHeight = 1080;

  logo(page: PdfPage, data: string, x: number, y: number, width: number, height: number) {
    const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(data);
    if (!match || match[1].length > 350000) return;
    try {
      const bytes = Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return;
      for (let i = 2; i + 8 < bytes.length;) {
        if (bytes[i] !== 0xff) { i++; continue; }
        const marker = bytes[i + 1];
        if (marker === 0xd9 || marker === 0xda) break;
        const length = bytes[i + 2] * 256 + bytes[i + 3];
        if (length < 2) break;
        if ([0xc0, 0xc1, 0xc2].includes(marker)) { this.imageHeight = bytes[i + 5] * 256 + bytes[i + 6]; this.imageWidth = bytes[i + 7] * 256 + bytes[i + 8]; break; }
        i += length + 2;
      }
      this.imageHex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("") + ">";
      const scale = Math.min(width / this.imageWidth, height / this.imageHeight);
      const w = this.imageWidth * scale; const h = this.imageHeight * scale;
      page.commands.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${(x + (width - w) / 2).toFixed(2)} ${(y + (height - h) / 2).toFixed(2)} cm /Logo Do Q`);
    } catch { /* A malformed logo must not prevent document creation. */ }
  }

  addPage() {
    const page = { commands: [] };
    this.pages.push(page);
    return page;
  }

  text(page: PdfPage, value: unknown, x: number, y: number, size = 9, bold = false, color: Color = NAVY, align: "left" | "right" = "left") {
    const safe = cleanText(value);
    const adjustedX = align === "right" ? x - approximateWidth(safe, size, bold) : x;
    page.commands.push(`${color.join(" ")} rg BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${adjustedX.toFixed(2)} ${y.toFixed(2)} Tm <${winAnsiHex(safe)}> Tj ET`);
  }

  rect(page: PdfPage, x: number, y: number, width: number, height: number, fill: Color, stroke?: Color) {
    page.commands.push(`${fill.join(" ")} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
    if (stroke) page.commands.push(`${stroke.join(" ")} RG 0.6 w ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S`);
  }

  line(page: PdfPage, x1: number, y1: number, x2: number, y2: number, color: Color = [0.86, 0.88, 0.91], width = 0.6) {
    page.commands.push(`${color.join(" ")} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  toBytes() {
    if (!this.pages.length) this.addPage();
    const objects: string[] = [];
    const pageIds = this.pages.map((_, index) => 6 + index * 2);
    objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
    const imageId = 5 + this.pages.length * 2;
    if (this.imageHex) objects[imageId] = `<< /Type /XObject /Subtype /Image /Width ${this.imageWidth} /Height ${this.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${this.imageHex.length} >>\nstream\n${this.imageHex}\nendstream`;
    const fontStart = imageId + (this.imageHex ? 1 : 0);
    PDF_FONTS.forEach((font, index) => {
      const descriptorId = fontStart + index; const programId = fontStart + 2 + index;
      objects[3 + index] = `<< /Type /Font /Subtype /TrueType /BaseFont /${font.name} /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 255 /Widths [${font.widths.join(" ")}] /FontDescriptor ${descriptorId} 0 R >>`;
      objects[descriptorId] = `<< /Type /FontDescriptor /FontName /${font.name} /Flags 32 /FontBBox [${font.bbox.join(" ")}] /ItalicAngle 0 /Ascent ${font.ascent} /Descent ${font.descent} /CapHeight ${font.ascent} /StemV ${index ? 110 : 80} /FontFile2 ${programId} 0 R >>`;
      objects[programId] = `<< /Length ${font.hex.length} /Length1 ${font.length} /Filter [/ASCIIHexDecode /FlateDecode] >>\nstream\n${font.hex}\nendstream`;
    });
    this.pages.forEach((page, index) => {
      const contentId = 5 + index * 2;
      const pageId = 6 + index * 2;
      const stream = page.commands.join("\n");
      objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${this.imageHex ? `/XObject << /Logo ${imageId} 0 R >>` : ""} >> /Contents ${contentId} 0 R >>`;
    });
    const chunks = ["%PDF-1.7\n%SOLIS\n"];
    let byteOffset = chunks[0].length;
    const offsets = [0];
    // Objects are ASCII (text and binary streams use hexadecimal encoding).
    for (let id = 1; id < objects.length; id += 1) {
      offsets[id] = byteOffset;
      const chunk = `${id} 0 obj\n${objects[id]}\nendobj\n`;
      chunks.push(chunk); byteOffset += chunk.length;
    }
    const xrefOffset = byteOffset;
    let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id += 1) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    xref += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    const output = chunks.join("") + xref;
    return new TextEncoder().encode(output);
  }
}

function companyValue(company: CompanyData, ...keys: string[]) {
  for (const key of keys) if (company[key]) return cleanText(company[key]);
  return "";
}

function money(value: unknown, currency: string) {
  const amount = Number(value || 0);
  try { return new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: currency === "CLP" ? 0 : 2 }).format(amount); }
  catch { return `${currency} ${amount.toFixed(currency === "CLP" ? 0 : 2)}`; }
}

function parsePayload(payloadJson: string) {
  try { return JSON.parse(payloadJson || "{}"); }
  catch { return {}; }
}

function drawHeader(pdf: PdfDocument, page: PdfPage, company: CompanyData, title: string, number: string, subtitle: string) {
  pdf.logo(page, companyValue(company, "logo_jpeg") || DEFAULT_PDF_LOGO, MARGIN, PAGE_HEIGHT - 82, 64, 64);
  const name = companyValue(company, "commercial_name", "name", "company_name") || "SOLIS INGENIERÍA Y SERVICIOS SpA";
  wrapText(name, 415, 11.5, true).slice(0, 2).forEach((text, i) => pdf.text(page, text, MARGIN + 78, PAGE_HEIGHT - 32 - i * 13, 11.5, true));
  pdf.text(page, companyValue(company, "tagline", "business_activity", "giro") || "Automatización · Control · Integración Industrial", MARGIN + 78, PAGE_HEIGHT - 60, 8, false, SLATE);
  pdf.text(page, companyValue(company, "address", "company_address") || "San Pedro de Atacama, Región de Antofagasta", MARGIN + 78, PAGE_HEIGHT - 73, 8, false, SLATE);
  pdf.line(page, MARGIN, PAGE_HEIGHT - 94, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 94, BLUE, 1.2);
  if (title !== "COTIZACIÓN") {
    pdf.text(page, title, MARGIN, PAGE_HEIGHT - 117, 15, true);
    pdf.text(page, number, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 113, 8.5, true, BLUE, "right");
    pdf.text(page, subtitle, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 127, 7, false, SLATE, "right");
  }
}

function drawFooter(pdf: PdfDocument, page: PdfPage, company: CompanyData, pageNumber: number, pageCount: number) {
  pdf.line(page, MARGIN, 34, PAGE_WIDTH - MARGIN, 34);
  const taxId = companyValue(company, "tax_id", "rut");
  const contact = [taxId ? `RUT ${taxId}` : "", companyValue(company, "email", "company_email"), companyValue(company, "phone", "company_phone")].filter(Boolean).join(" · ");
  wrapText(contact || "SOLIS Ingeniería y Servicios SpA", 410, 6.8).slice(0, 2).forEach((line, index) => pdf.text(page, line, MARGIN, 22 - index * 8, 6.8, false, SLATE));
  pdf.text(page, `Página ${pageNumber} de ${pageCount}`, PAGE_WIDTH - MARGIN, 20, 7.5, false, SLATE, "right");
}

function labelValue(pdf: PdfDocument, page: PdfPage, label: string, value: unknown, x: number, y: number, width: number) {
  pdf.text(page, label.toUpperCase(), x, y, 7, true, SLATE);
  const lines = wrapText(value || "-", width, 10).slice(0, 2);
  lines.forEach((line, index) => pdf.text(page, line, x, y - 15 - index * 12, 10, index === 0, NAVY));
}

function addQuoteTableHeader(pdf: PdfDocument, page: PdfPage, y: number) {
  const xs = [MARGIN, 68, 303, 342, 383, 466, PAGE_WIDTH - MARGIN];
  const labels = ["Ítem", "Descripción", "Cant.", "Unidad", "P. unitario", "Total neto"];
  pdf.rect(page, MARGIN, y - 22, PAGE_WIDTH - MARGIN * 2, 22, BLUE);
  labels.forEach((label, i) => pdf.text(page, label, xs[i] + 5, y - 14, 7.5, true, WHITE));
  xs.slice(1, -1).forEach((x) => pdf.line(page, x, y, x, y - 22, WHITE, 0.4));
  return y - 22;
}

export function buildQuotePdf(input: { company: CompanyData; client?: ClientPdfData; quote: QuotePdfData; items: QuotePdfItem[] }) {
  const { company, quote, items } = input;
  const client = input.client || { name: quote.clientName };
  const payload = parsePayload(quote.payloadJson);
  const quoteMoney = (value: unknown) => money(value, quote.currency) + (quote.currency === "CLP" ? " CLP" : "");
  const pdf = new PdfDocument();
  let page = pdf.addPage();
  let y = 0;
  const width = PAGE_WIDTH - MARGIN * 2;
  const newPage = (continuation = false) => {
    if (continuation) page = pdf.addPage();
    drawHeader(pdf, page, company, "COTIZACIÓN", quote.number, quote.status);
    pdf.text(page, "COTIZACIÓN", MARGIN, PAGE_HEIGHT - 125, 23, true);
    y = PAGE_HEIGHT - 144;
    for (const line of wrapText(quote.project, width, 11)) { pdf.text(page, line, MARGIN, y, 11, true, BLUE); y -= 14; }
    if (continuation) { pdf.text(page, `${quote.number} · ${quote.status} · Continuación`, MARGIN, y, 8, false, SLATE); y -= 22; }
    else y -= 8;
  };
  const ensure = (height: number) => { if (y - height < 62) newPage(true); };
  const section = (title: string) => { ensure(35); pdf.text(page, title, MARGIN, y, 11.5, true, BLUE); y -= 14; };
  const paragraph = (value: unknown, bold = false, inset = 0, size = 8) => {
    for (const line of wrapText(value, width - inset * 2, size)) { ensure(13); pdf.text(page, line, MARGIN + inset, y, size, bold); y -= 11.5; }
  };
  const cell = (value: unknown, x: number, top: number, w: number, h: number, label = false) => {
    pdf.rect(page, x, top - h, w, h, label ? PALE_BLUE : WHITE, [0.78, 0.83, 0.89]);
    wrapText(value, w - 10, 7.6, true).forEach((line, i) => pdf.text(page, line, x + 5, top - 13 - i * 10, 7.6, true));
  };
  newPage();
  const metadata = [["Cliente", client.name || quote.clientName, "Fecha", quote.issueDate.split("-").reverse().join("/")], ["RUT", client.taxId || "-", "Cotización", quote.number], ["Contacto", client.contactName || client.email || "-", "Validez", `${payload.validityDays ?? payload.validity_days ?? 20} días corridos`]];
  metadata.forEach(([a, b, c, d]) => {
    const h = Math.max(19, Math.max(wrapText(b, 231, 7.6, true).length, wrapText(d, 141, 7.6, true).length) * 10 + 9);
    cell(a, MARGIN, y, 56, h, true); cell(b, MARGIN + 56, y, 241, h); cell(c, MARGIN + 297, y, 63, h, true); cell(d, MARGIN + 360, y, width - 360, h); y -= h;
  });
  y -= 25;
  section("OFERTA ECONÓMICA"); y = addQuoteTableHeader(pdf, page, y);
  const xs = [MARGIN, 68, 303, 342, 383, 466, PAGE_WIDTH - MARGIN];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const lines = [...wrapText(item.name, 225, 8, true).map((text) => ({ text, bold: true })), ...wrapText(item.detail, 225, 8).filter(Boolean).map((text) => ({ text, bold: false }))];
    // Split long descriptions across pages without losing scope text.
    let offset = 0;
    while (offset < lines.length) {
      if (y < 96) { newPage(true); section("OFERTA ECONÓMICA (CONTINUACIÓN)"); y = addQuoteTableHeader(pdf, page, y); }
      const count = Math.min(lines.length - offset, Math.max(1, Math.floor((y - 72) / 10) - 1));
      const chunk = lines.slice(offset, offset + count);
      const h = Math.max(25, chunk.length * 10 + 10);
      pdf.rect(page, MARGIN, y - h, width, h, index % 2 ? LIGHT : WHITE);
      for (const x of xs) pdf.line(page, x, y, x, y - h, [0.78, 0.83, 0.89]);
      pdf.line(page, MARGIN, y - h, PAGE_WIDTH - MARGIN, y - h, [0.78, 0.83, 0.89]);
      pdf.text(page, offset ? "..." : index + 1, MARGIN + 8, y - 15, 8, true);
      chunk.forEach((line, i) => pdf.text(page, line.text, 73, y - 14 - i * 10, 8, line.bold, line.bold ? NAVY : SLATE));
      if (!offset) {
        pdf.text(page, Number(item.quantity).toLocaleString("es-CL", { maximumFractionDigits: 4 }), 335, y - 15, 7.5, true, NAVY, "right");
        pdf.text(page, item.unit, 348, y - 15, 7.5, true);
        pdf.text(page, quoteMoney(item.unitPrice), 460, y - 15, 7.6, true, NAVY, "right");
        pdf.text(page, quoteMoney(Number(item.unitPrice) * Number(item.quantity)), PAGE_WIDTH - MARGIN - 5, y - 15, 7.6, true, NAVY, "right");
      }
      offset += count; y -= h;
    }
  }
  y -= 6; ensure(113);
  const discountPercent = Number(payload.discountPercent ?? payload.discount_percent ?? 0);
  const taxPercent = Number(payload.taxPercent ?? payload.tax_percent ?? 19);
  const totals = [["Subtotal bruto", quote.grossSubtotal], [`Descuento${discountPercent ? ` ${discountPercent}%` : ""}`, Math.max(0, Number(quote.grossSubtotal) - Number(quote.netSubtotal))], ["Subtotal neto", quote.netSubtotal], [`IVA ${taxPercent}%`, quote.tax], ["TOTAL IVA INCLUIDO", quote.total]];
  const totalX = 317;
  totals.forEach(([label, value], index) => {
    pdf.rect(page, totalX, y - 21, PAGE_WIDTH - MARGIN - totalX, 21, index === 4 ? [0.83, 0.90, 0.98] : PALE_BLUE, [0.78, 0.83, 0.89]);
    pdf.text(page, label, totalX + 6, y - 14, 7.6, true);
    const amount = Number(value); pdf.text(page, `${index === 1 && amount ? "- " : ""}${quoteMoney(amount)}`, PAGE_WIDTH - MARGIN - 6, y - 14, 8, true, NAVY, "right"); y -= 21;
  });
  y -= 23; ensure(76); section("CONDICIONES COMERCIALES");
  const conditions = [["Forma de pago", payload.paymentTerms ?? payload.payment_terms ?? "Por definir", "Plazo", payload.deliveryTerms ?? payload.delivery_terms ?? "Por definir"], ["Moneda", `${quote.currency} - valores netos`, "Estado", quote.status]];
  conditions.forEach(([a, b, c, d]) => {
    const h = Math.max(20, Math.max(wrapText(b, 184, 7.6, true).length, wrapText(d, 160, 7.6, true).length) * 10 + 9);
    ensure(h); cell(a, MARGIN, y, 74, h, true); cell(b, MARGIN + 74, y, 194, h); cell(c, MARGIN + 268, y, 73, h, true); cell(d, MARGIN + 341, y, width - 341, h); y -= h;
  });
  const validation = cleanText(payload.technicalValidation ?? payload.technical_validation);
  if (validation) {
    y -= 12;
    const lines = wrapText(validation, width - 14, 8, true);
    for (let i = 0; i < lines.length; i += 16) {
      const chunk = lines.slice(i, i + 16); const h = 27 + chunk.length * 11; ensure(h);
      pdf.rect(page, MARGIN, y - h, width, h, [1, 0.97, 0.85], [0.79, 0.57, 0.12]);
      pdf.text(page, "VALIDACIÓN TÉCNICA", MARGIN + 7, y - 13, 8, true);
      chunk.forEach((line, j) => pdf.text(page, line, MARGIN + 7, y - 27 - j * 11, 8, true)); y -= h + 5;
    }
  }
  for (const [label, value] of [["ALCANCE Y EXCLUSIONES", payload.scopeExclusions], ["OBSERVACIONES", payload.notes]]) {
    if (!cleanText(value)) continue;
    y -= 18; section(label); paragraph(value, false); y -= 3;
  }
  y -= 18; ensure(71);
  pdf.rect(page, MARGIN, y - 66, width / 2, 66, LIGHT, [0.78, 0.83, 0.89]);
  pdf.rect(page, MARGIN + width / 2, y - 66, width / 2, 66, LIGHT, [0.78, 0.83, 0.89]);
  pdf.text(page, "Por " + (companyValue(company, "commercial_name", "name") || "SOLIS Ingeniería y Servicios SpA"), MARGIN + 7, y - 15, 7.8, true);
  pdf.text(page, companyValue(company, "representative", "contact_name") || "Responsable comercial", MARGIN + 7, y - 28, 8, true);
  pdf.text(page, "Firma: __________________________", MARGIN + 7, y - 53, 8, true);
  pdf.text(page, "Aceptación del cliente", MARGIN + width / 2 + 7, y - 15, 8, true);
  pdf.text(page, "Nombre y firma: _____________________", MARGIN + width / 2 + 7, y - 53, 8, true);
  pdf.pages.forEach((p, i) => drawFooter(pdf, p, company, i + 1, pdf.pages.length));
  return pdf.toBytes();
}

export function buildPurchaseOrderPdf(input: { company: CompanyData; supplier: SupplierPdfData; purchase: PurchasePdfData; items: PurchasePdfItem[] }) {
  const { company, supplier, purchase, items } = input;
  const pdf = new PdfDocument();
  let page = pdf.addPage();
  drawHeader(pdf, page, company, "ORDEN DE COMPRA", purchase.number, purchase.status);
  let y = PAGE_HEIGHT - 152;
  labelValue(pdf, page, "Proveedor", supplier.name || purchase.supplier, MARGIN, y, 235);
  labelValue(pdf, page, "RUT", supplier.taxId || "-", 310, y, 120);
  labelValue(pdf, page, "Moneda", purchase.currency, 455, y, 95);
  y -= 54;
  labelValue(pdf, page, "Contacto", supplier.contactName || supplier.email || "-", MARGIN, y, 210);
  labelValue(pdf, page, "Condición de pago", supplier.paymentTerms || "Por definir", 275, y, 175);
  labelValue(pdf, page, "Fecha", (purchase.orderedAt || purchase.approvedAt || purchase.createdAt).slice(0, 10), 475, y, 75);
  y -= 55;
  if (purchase.workOrderNumber || purchase.project) {
    labelValue(pdf, page, "Destino", [purchase.workOrderNumber, purchase.project].filter(Boolean).join(" · "), MARGIN, y, PAGE_WIDTH - MARGIN * 2);
    y -= 52;
  }
  pdf.rect(page, MARGIN, y - 19, PAGE_WIDTH - MARGIN * 2, 23, LIGHT);
  pdf.text(page, "DESCRIPCIÓN", MARGIN + 7, y - 10, 7.5, true, SLATE);
  pdf.text(page, "CANT.", 380, y - 10, 7.5, true, SLATE, "right");
  pdf.text(page, "UN.", 420, y - 10, 7.5, true, SLATE, "right");
  pdf.text(page, "COSTO UNIT.", 500, y - 10, 7.5, true, SLATE, "right");
  pdf.text(page, "TOTAL", PAGE_WIDTH - MARGIN - 7, y - 10, 7.5, true, SLATE, "right");
  y -= 28;
  for (const item of items) {
    const lines = wrapText(item.description, 285, 8.5);
    const rowHeight = Math.max(28, lines.length * 11 + 10);
    if (y - rowHeight < 165) {
      page = pdf.addPage();
      drawHeader(pdf, page, company, "ORDEN DE COMPRA", purchase.number, "Continuación");
      y = PAGE_HEIGHT - 154;
    }
    lines.forEach((line, index) => pdf.text(page, line, MARGIN + 7, y - 10 - index * 11, 8.5, index === 0));
    pdf.text(page, item.quantity, 380, y - 10, 8.5, false, NAVY, "right");
    pdf.text(page, item.unit, 420, y - 10, 8.5, false, NAVY, "right");
    pdf.text(page, money(item.unitCost, purchase.currency), 500, y - 10, 8.5, false, NAVY, "right");
    pdf.text(page, money(item.lineTotal, purchase.currency), PAGE_WIDTH - MARGIN - 7, y - 10, 8.5, true, NAVY, "right");
    pdf.line(page, MARGIN, y - rowHeight, PAGE_WIDTH - MARGIN, y - rowHeight);
    y -= rowHeight;
  }
  if (y < 400) {
    page = pdf.addPage();
    drawHeader(pdf, page, company, "ORDEN DE COMPRA", purchase.number, "Resumen y aprobación");
    y = PAGE_HEIGHT - 159;
  }
  const totals = [
    ["Subtotal", money(purchase.subtotal, purchase.currency)],
    [`Descuento (${Number(purchase.discountPercent || 0)}%)`, money(purchase.discountAmount, purchase.currency)],
    ...(Number(purchase.dispatchNet || 0) ? [["Despacho neto", money(purchase.dispatchNet || "0", purchase.currency)]] : []),
    ["Neto", money(purchase.netSubtotal, purchase.currency)],
    [`Impuesto (${Number(purchase.taxPercent || 0)}%)`, money(purchase.taxAmount, purchase.currency)],
  ];
  totals.forEach(([label, value], index) => {
    pdf.text(page, label, 340, y - index * 19, 8.5, false, SLATE);
    pdf.text(page, value, PAGE_WIDTH - MARGIN, y - index * 19, 9, true, NAVY, "right");
  });
  const totalY = y - (totals.length * 19 + 6);
  pdf.rect(page, 332, totalY - 18, PAGE_WIDTH - MARGIN - 332, 32, NAVY);
  pdf.text(page, "TOTAL", 340, totalY - 7, 9, true, [1, 1, 1]);
  pdf.text(page, money(purchase.total, purchase.currency), PAGE_WIDTH - MARGIN - 8, totalY - 7, 12, true, AMBER, "right");
  const approvalY = totalY - 52;
  pdf.text(page, "APROBACIÓN INTERNA", MARGIN, approvalY, 8, true, SLATE);
  pdf.text(page, `${purchase.approvedBy || "Pendiente"}${purchase.approvedAt ? ` · ${purchase.approvedAt.slice(0, 16).replace("T", " ")}` : ""}`, MARGIN, approvalY - 17, 9, true);
  if (purchase.approvalNotes) wrapText(purchase.approvalNotes, 250, 8).slice(0, 3).forEach((line, index) => pdf.text(page, line, MARGIN, approvalY - 34 - index * 11, 8, false, SLATE));
  let notesY = approvalY - 82;
  pdf.text(page, "OBSERVACIONES", MARGIN, notesY, 8, true, SLATE);
  notesY -= 17;
  for (const line of wrapText(purchase.notes || "Sin observaciones.", PAGE_WIDTH - MARGIN * 2, 8)) {
    if (notesY < 90) {
      page = pdf.addPage();
      drawHeader(pdf, page, company, "ORDEN DE COMPRA", purchase.number, "Condiciones de suministro");
      notesY = PAGE_HEIGHT - 159;
    }
    pdf.text(page, line, MARGIN, notesY, 8);
    notesY -= 11;
  }
  pdf.text(page, "Documento interno de abastecimiento. Los costos se cargan a la orden al entregar el material, no al recibir la compra.", MARGIN, 49, 7.5, false, SLATE);
  pdf.pages.forEach((currentPage, index) => drawFooter(pdf, currentPage, company, index + 1, pdf.pages.length));
  return pdf.toBytes();
}

export function buildWorkOrderPdf(input: { company: CompanyData; order: WorkOrderPdfData; quote: QuotePdfData; items: QuotePdfItem[]; execution?: WorkOrderExecutionPdfData }) {
  const { company, order, quote, items, execution } = input;
  const pdf = new PdfDocument();
  let page = pdf.addPage();
  drawHeader(pdf, page, company, "ORDEN DE TRABAJO", order.number, `Origen: ${quote.number}`);
  let y = PAGE_HEIGHT - 152;
  labelValue(pdf, page, "Cliente", order.clientName, MARGIN, y, 235);
  labelValue(pdf, page, "Proyecto", order.project, 310, y, 240);
  y -= 54;
  labelValue(pdf, page, "Responsable", order.responsible || "Sin asignar", MARGIN, y, 180);
  labelValue(pdf, page, "Estado / prioridad", `${order.status} · ${order.priority || "Normal"}`, 245, y, 165);
  labelValue(pdf, page, "Fecha", order.createdDate, 430, y, 120);
  y -= 54;
  labelValue(pdf, page, "Inicio planificado", order.plannedStart || "Por definir", MARGIN, y, 180);
  labelValue(pdf, page, "Fin planificado", order.plannedEnd || "Por definir", 245, y, 180);
  labelValue(pdf, page, "Compromiso", order.dueDate || "Por definir", 430, y, 120);
  y -= 59;
  pdf.text(page, "ALCANCE APROBADO", MARGIN, y, 8, true, SLATE);
  y -= 17;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const lines = wrapText(`${index + 1}. ${item.name}${item.detail ? ` - ${item.detail}` : ""}`, 405, 8.5).slice(0, 4);
    const rowHeight = Math.max(25, lines.length * 11 + 8);
    if (y - rowHeight < 105) {
      page = pdf.addPage();
      drawHeader(pdf, page, company, "ORDEN DE TRABAJO", order.number, `Origen: ${quote.number}`);
      y = PAGE_HEIGHT - 152;
      pdf.text(page, "ALCANCE APROBADO (CONTINUACIÓN)", MARGIN, y, 8, true, SLATE);
      y -= 19;
    }
    lines.forEach((line, lineIndex) => pdf.text(page, line, MARGIN + 7, y - lineIndex * 11, 8.5, lineIndex === 0));
    pdf.text(page, `${item.quantity} ${item.unit}`, PAGE_WIDTH - MARGIN, y, 8.5, true, NAVY, "right");
    pdf.line(page, MARGIN, y - rowHeight + 7, PAGE_WIDTH - MARGIN, y - rowHeight + 7);
    y -= rowHeight;
  }

  const notes = cleanText(order.notes);
  if (y < 170) {
    page = pdf.addPage();
    drawHeader(pdf, page, company, "ORDEN DE TRABAJO", order.number, `Origen: ${quote.number}`);
    y = PAGE_HEIGHT - 154;
  }
  pdf.rect(page, MARGIN, y - 104, PAGE_WIDTH - MARGIN * 2, 112, LIGHT, [0.86, 0.88, 0.91]);
  pdf.text(page, "INSTRUCCIONES OPERATIVAS", MARGIN + 12, y - 14, 8, true, SLATE);
  wrapText(notes || "Sin instrucciones adicionales.", PAGE_WIDTH - MARGIN * 2 - 24, 8.5).slice(0, 6).forEach((line, index) => pdf.text(page, line, MARGIN + 12, y - 31 - index * 12, 8.5));
  if (execution && (execution.activities.length || execution.entries.length || execution.evidence.length || execution.signoff)) {
    page = pdf.addPage();
    drawHeader(pdf, page, company, "INFORME DE EJECUCIÓN", order.number, `Origen: ${quote.number}`);
    y = PAGE_HEIGHT - 156;
    const required = execution.activities.filter((activity) => activity.required);
    const completed = required.filter((activity) => activity.completed).length;
    const progress = required.length ? Math.round((completed / required.length) * 100) : 0;
    const hours = execution.entries.filter((entry) => entry.type === "hours").reduce((sum, entry) => sum + entry.quantity, 0);
    labelValue(pdf, page, "Avance obligatorio", `${progress}% (${completed}/${required.length})`, MARGIN, y, 180);
    labelValue(pdf, page, "Horas registradas", String(hours), 245, y, 130);
    labelValue(pdf, page, "Evidencias", String(execution.evidence.length), 430, y, 120);
    y -= 58;
    pdf.text(page, "CHECKLIST DE TERRENO", MARGIN, y, 8, true, SLATE);
    y -= 18;
    const activityLines = execution.activities.slice(0, 18);
    for (const activity of activityLines) {
      pdf.text(page, `${activity.completed ? "[OK]" : "[  ]"} ${activity.title}${activity.required ? " *" : ""}`, MARGIN + 5, y, 8.5, activity.completed, activity.completed ? [0.08, 0.45, 0.26] : SLATE);
      y -= 13;
    }
    if (execution.entries.length) {
      y -= 8;
      pdf.text(page, "REGISTROS REALES", MARGIN, y, 8, true, SLATE);
      y -= 18;
      for (const entry of execution.entries.slice(0, 14)) {
        const line = `${entry.entryDate} · ${entry.type.toUpperCase()} · ${entry.description} · ${entry.quantity} ${entry.unit}`;
        wrapText(line, PAGE_WIDTH - MARGIN * 2, 8).slice(0, 2).forEach((wrapped, index) => pdf.text(page, wrapped, MARGIN + 5, y - index * 11, 8));
        y -= 14;
        if (y < 150) break;
      }
    }
    if (execution.signoff) {
      const signoffY = Math.max(130, y - 14);
      pdf.rect(page, MARGIN, signoffY - 62, PAGE_WIDTH - MARGIN * 2, 70, LIGHT, [0.86, 0.88, 0.91]);
      pdf.text(page, "CONFORMIDAD OPERATIVA REGISTRADA", MARGIN + 12, signoffY - 12, 8, true, SLATE);
      pdf.text(page, `${execution.signoff.customerName}${execution.signoff.customerRole ? ` · ${execution.signoff.customerRole}` : ""}`, MARGIN + 12, signoffY - 30, 9, true);
      pdf.text(page, `${execution.signoff.signedAt.slice(0, 16).replace("T", " ")} · Firma capturada en la PWA`, MARGIN + 12, signoffY - 46, 8, false, SLATE);
    }
    if (execution.materialRequests?.length) {
      page = pdf.addPage();
      drawHeader(pdf, page, company, "SOLICITUDES DE MATERIALES", order.number, `Origen: ${quote.number}`);
      y = PAGE_HEIGHT - 156;
      pdf.text(page, "TRAZABILIDAD DE ABASTECIMIENTO", MARGIN, y, 8, true, SLATE);
      y -= 22;
      for (const request of execution.materialRequests.slice(0, 24)) {
        const materials = request.items.map((item) => `${item.quantity} ${item.unit} ${item.description}`).join("; ");
        const line = `${request.status} · ${request.urgency}${request.neededDate ? ` · requerido ${request.neededDate}` : ""} · ${request.activityTitle} · ${materials}`;
        const lines = wrapText(line, PAGE_WIDTH - MARGIN * 2 - 10, 8).slice(0, 3);
        lines.forEach((wrapped, index) => pdf.text(page, wrapped, MARGIN + 5, y - index * 11, 8, index === 0 && request.status === "Entregada"));
        y -= lines.length * 11 + 9;
        pdf.line(page, MARGIN, y + 4, PAGE_WIDTH - MARGIN, y + 4);
        if (y < 85) break;
      }
    }
  }
  pdf.text(page, `Aprobación comercial: ${quote.approvedBy || "registrada"}${quote.approvedAt ? ` · ${quote.approvedAt.slice(0, 10)}` : ""}`, MARGIN, 49, 7.5, false, SLATE);
  pdf.pages.forEach((currentPage, index) => drawFooter(pdf, currentPage, company, index + 1, pdf.pages.length));
  return pdf.toBytes();
}

export function buildClosureReportPdf(input: { company: CompanyData; closure: ClosurePdfData }) {
  const { company, closure } = input;
  const pdf = new PdfDocument();
  const page = pdf.addPage();
  drawHeader(pdf, page, company, "CIERRE DE ORDEN", closure.number, "Informe interno de rentabilidad real");
  let y = PAGE_HEIGHT - 152;
  labelValue(pdf, page, "Cliente", closure.clientName, MARGIN, y, 235);
  labelValue(pdf, page, "Proyecto", closure.project, 310, y, 240);
  y -= 55;
  labelValue(pdf, page, "Cerrada por", closure.closedBy, MARGIN, y, 235);
  labelValue(pdf, page, "Fecha de cierre", closure.closedAt.slice(0, 16).replace("T", " "), 310, y, 240);
  y -= 68;
  pdf.text(page, "RESULTADO ECONÓMICO FINAL", MARGIN, y, 8, true, SLATE);
  y -= 22;
  const metrics = [
    ["Venta aprobada", money(closure.sale, closure.currency)],
    ["Costo presupuestado", money(closure.budgetedCost, closure.currency)],
    ["Costo real", money(closure.actualCost, closure.currency)],
    ["Utilidad real", money(closure.actualProfit, closure.currency)],
    ["Margen real", `${closure.actualMarginPercent.toFixed(2)}%`],
    ["Desviación de costo", money(closure.budgetVariance, closure.currency)],
  ];
  metrics.forEach(([label, value], index) => {
    const column = index % 2; const row = Math.floor(index / 2);
    const x = MARGIN + column * 255; const top = y - row * 55;
    pdf.rect(page, x, top - 38, 238, 46, index === 3 ? [0.91, 0.97, 0.93] : LIGHT, [0.86, 0.88, 0.91]);
    pdf.text(page, label.toUpperCase(), x + 10, top - 9, 7, true, SLATE);
    pdf.text(page, value, x + 10, top - 27, 11, true, NAVY);
  });
  y -= 185;
  pdf.text(page, "COMPOSICIÓN DEL COSTO REAL", MARGIN, y, 8, true, SLATE);
  y -= 20;
  const labels: Record<string, string> = { hours: "Mano de obra", material: "Materiales", service: "Servicios", expense: "Otros gastos", note: "Observaciones" };
  const breakdown = Object.entries(closure.breakdown).filter(([, value]) => value !== 0);
  if (!breakdown.length) pdf.text(page, "Sin costos monetarios registrados.", MARGIN + 5, y, 8.5, false, SLATE);
  breakdown.slice(0, 8).forEach(([key, value], index) => {
    pdf.text(page, labels[key] || key, MARGIN + 5, y - index * 18, 8.5);
    pdf.text(page, money(value, closure.currency), PAGE_WIDTH - MARGIN, y - index * 18, 8.5, true, NAVY, "right");
  });
  y -= Math.max(45, breakdown.length * 18 + 24);
  pdf.text(page, "CONTROL DE CIERRE", MARGIN, y, 8, true, SLATE);
  y -= 20;
  const controls = [`${closure.counts.activities} actividades registradas`, `${closure.counts.materialRequests} solicitudes de material resueltas`, `${closure.counts.purchases} procesos de compra cerrados`, `${closure.counts.signoffs} conformidad(es) del cliente`];
  controls.forEach((value, index) => pdf.text(page, `[OK] ${value}`, MARGIN + 5, y - index * 15, 8.5, true, [0.08, 0.45, 0.26]));
  y -= 85;
  pdf.rect(page, MARGIN, y - 82, PAGE_WIDTH - MARGIN * 2, 92, LIGHT, [0.86, 0.88, 0.91]);
  pdf.text(page, "NOTA DE CIERRE", MARGIN + 12, y - 10, 8, true, SLATE);
  wrapText(closure.closureNotes, PAGE_WIDTH - MARGIN * 2 - 24, 8.5).slice(0, 5).forEach((line, index) => pdf.text(page, line, MARGIN + 12, y - 28 - index * 12, 8.5));
  pdf.text(page, "Documento interno. La orden y sus costos quedaron congelados al cerrar.", MARGIN, 49, 7.5, false, SLATE);
  drawFooter(pdf, page, company, 1, 1);
  return pdf.toBytes();
}

export function buildCollectionDocumentPdf(input: { company: CompanyData; document: CollectionPdfData }) {
  const { company, document } = input;
  const pdf = new PdfDocument();
  const page = pdf.addPage();
  drawHeader(pdf, page, company, "DOCUMENTO DE COBRO", document.number, `${document.concept} · ${document.status}`);
  let y = PAGE_HEIGHT - 152;
  labelValue(pdf, page, "Cliente", document.clientName, MARGIN, y, 235);
  labelValue(pdf, page, "Proyecto", document.project, 310, y, 240);
  y -= 56;
  labelValue(pdf, page, "Emisión", document.issueDate, MARGIN, y, 150);
  labelValue(pdf, page, "Vencimiento", document.dueDate, 205, y, 150);
  labelValue(pdf, page, "Moneda", document.currency, 430, y, 120);
  y -= 70;
  pdf.text(page, "RESUMEN DEL COBRO", MARGIN, y, 8, true, SLATE);
  y -= 22;
  const rows = [
    ["Monto neto", money(document.netAmount, document.currency)],
    [`IVA referencial (${document.taxPercent}%)`, money(document.taxAmount, document.currency)],
    ["Total documento", money(document.totalAmount, document.currency)],
    ["Pagos recibidos", money(document.paidAmount, document.currency)],
  ];
  rows.forEach(([label, value], index) => {
    pdf.rect(page, MARGIN, y - index * 36 - 27, PAGE_WIDTH - MARGIN * 2, 32, index === 2 ? NAVY : LIGHT, [0.86, 0.88, 0.91]);
    pdf.text(page, label, MARGIN + 12, y - index * 36 - 14, 9, index === 2, index === 2 ? [1, 1, 1] : SLATE);
    pdf.text(page, value, PAGE_WIDTH - MARGIN - 12, y - index * 36 - 14, index === 2 ? 11 : 9, true, index === 2 ? AMBER : NAVY, "right");
  });
  y -= 168;
  pdf.rect(page, MARGIN, y - 38, PAGE_WIDTH - MARGIN * 2, 46, document.balance > 0 ? [1, 0.96, 0.86] : [0.91, 0.97, 0.93], [0.86, 0.88, 0.91]);
  pdf.text(page, "SALDO PENDIENTE", MARGIN + 12, y - 10, 8, true, SLATE);
  pdf.text(page, money(document.balance, document.currency), PAGE_WIDTH - MARGIN - 12, y - 14, 13, true, NAVY, "right");
  y -= 70;
  pdf.text(page, "PAGOS REGISTRADOS", MARGIN, y, 8, true, SLATE);
  y -= 20;
  if (!document.payments.length) pdf.text(page, "Aún no existen pagos registrados.", MARGIN + 5, y, 8.5, false, SLATE);
  document.payments.slice(0, 12).forEach((payment, index) => {
    const line = `${payment.paymentDate} · ${payment.method} · ${payment.reference}`;
    pdf.text(page, line, MARGIN + 5, y - index * 18, 8.5);
    pdf.text(page, money(payment.amount, document.currency), PAGE_WIDTH - MARGIN, y - index * 18, 8.5, true, NAVY, "right");
  });
  y -= Math.max(45, document.payments.length * 18 + 25);
  pdf.text(page, "OBSERVACIONES", MARGIN, y, 8, true, SLATE);
  wrapText(document.notes || "Sin observaciones.", PAGE_WIDTH - MARGIN * 2, 8.5).slice(0, 5).forEach((line, index) => pdf.text(page, line, MARGIN, y - 18 - index * 12, 8.5));
  pdf.text(page, "Documento interno de cobro y seguimiento. No reemplaza una factura electrónica DTE autorizada por el SII.", MARGIN, 49, 7.5, false, SLATE);
  drawFooter(pdf, page, company, 1, 1);
  return pdf.toBytes();
}

export function buildOrderMaterialsPdf(data: OrderMaterialsData) {
  const pdf = new PdfDocument();
  let page: PdfPage; let y = 0;
  const next = () => { page = pdf.addPage(); drawHeader(pdf, page, data.company, "MATERIALES DE TRABAJO", data.order.number, data.quoteNumber); y = PAGE_HEIGHT - 154; };
  const line = (text: string, bold = false, size = 8) => { for (const value of wrapText(text, PAGE_WIDTH - MARGIN * 2 - 12, size)) { if (y < 66) next(); pdf.text(page, value, MARGIN + 6, y, size, bold); y -= 12; } };
  next();
  line(`${data.order.clientName} · ${data.order.project}`, true, 9);
  line(`Responsable: ${data.order.responsible || "Por asignar"} · Estado: ${data.order.status}`);
  line(`Consulta: ${data.preparedAt.slice(0, 16).replace("T", " ")} UTC. Verifique cambios posteriores antes de retirar materiales.`);
  y -= 12;
  const heading = (title: string) => { if (y < 110) next(); pdf.rect(page, MARGIN, y - 9, PAGE_WIDTH - MARGIN * 2, 23, PALE_BLUE); pdf.text(page, title, MARGIN + 6, y - 1, 9, true, BLUE); y -= 30; };
  const material = (item: { description: string; quantity: number; unit: string; code?: string; specification?: string; brand?: string }, index: number) => {
    if (y < 134) next();
    line(`${index + 1}. ${item.code ? item.code + " · " : ""}${item.description}`, true);
    if (item.specification || item.brand) line([item.brand, item.specification].filter(Boolean).join(" / "));
    line(`Cantidad: ${item.quantity.toLocaleString("es-CL")} ${item.unit}     Entregado: __________     Fecha: __________`);
    line("Observación: __________________________________________________________________");
    y -= 4; pdf.line(page, MARGIN, y, PAGE_WIDTH - MARGIN, y); y -= 15;
  };
  for (const group of data.groups) { heading(group.title); group.materials.forEach(material); }
  if (data.requests.length) {
    heading("SOLICITUDES DE TERRENO");
    line("Se muestran por separado. Pueden coincidir con el presupuesto; no sumarlas automáticamente.");
    for (const request of data.requests) { heading(`Solicitud ${request.number} · ${request.status}`); request.items.forEach(material); }
  }
  if (!data.groups.length && !data.requests.length) line("Esta orden aún no tiene materiales desglosados.");
  if (y < 130) next(); y -= 15;
  line("Entrega de bodega: _____________________    Recibe: _____________________", true);
  line("Fecha: _____________________    Firma: _____________________");
  pdf.pages.forEach((p, i) => drawFooter(pdf, p, data.company, i + 1, pdf.pages.length)); return pdf.toBytes();
}

export function buildAccountingRequestPdf(packet: AccountingPacket) {
  const pdf = new PdfDocument(); let page!: PdfPage; let y = 0;
  const company = { commercial_name: packet.issuer.name, tax_id: packet.issuer.taxId, address: packet.issuer.address, email: packet.issuer.email, phone: packet.issuer.phone };
  const next = () => { page = pdf.addPage(); drawHeader(pdf, page, company, "SOLICITUD DE FACTURACIÓN", packet.number, packet.billingNumber); y = PAGE_HEIGHT - 160; };
  next();
  for (const paragraph of accountingText(packet).split("\n")) {
    for (const line of wrapText(paragraph, PAGE_WIDTH - MARGIN * 2 - 8, 9)) {
      if (y < 68) next();
      pdf.text(page, line, MARGIN + 4, y, 9, paragraph.startsWith("SOLICITUD INTERNA") || paragraph.startsWith("Total:")); y -= 14;
    }
    y -= 5;
  }
  if (y < 90) next();
  pdf.text(page, `Preparada por ${packet.preparedBy} · ${packet.preparedAt.slice(0, 10)}`, MARGIN, y - 8, 8, false, SLATE);
  pdf.pages.forEach((p, i) => drawFooter(pdf, p, company, i + 1, pdf.pages.length)); return pdf.toBytes();
}
