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
const QUOTE_BLUE = [0.03, 0.408, 0.808] as const;
const QUOTE_LABEL = [0.918, 0.953, 0.988] as const;
const QUOTE_TOTAL = [0.835, 0.910, 0.980] as const;
const QUOTE_ALTERNATE = [0.957, 0.965, 0.973] as const;

type PdfPage = { commands: string[] };
type Color = readonly [number, number, number];

export function buildSupplierInquiryPdf(input: { company: CompanyData; number: string; project: string; issueDate: string; rows: SupplierMaterial[] }) {
  const l = new PdfLayout(input.company, "SOLICITUD DE PRECIOS", input.number, input.issueDate);
  l.paragraph(`Proyecto: ${input.project}`, 9, true);
  l.paragraph("Solicitamos precio unitario neto, moneda, impuestos, disponibilidad, plazo de entrega, despacho, garantía y vigencia de su oferta.");
  l.paragraph("Documento para solicitar una oferta. No constituye una orden de compra."); l.gap();
  input.rows.forEach((item, index) => {
    l.ensure(95);
    l.paragraph(`${index + 1}. ${item.code ? item.code + " - " : ""}${item.description}`, 8.5, true);
    l.paragraph(`Cantidad: ${item.quantity} ${item.unit}`);
    if (item.brand) l.paragraph(`Marca / modelo: ${item.brand}`);
    if (item.specification) l.paragraph(`Especificación: ${item.specification}`);
    l.paragraph(`Lista(s): ${item.lists.join(" / ")}`);
    l.paragraph("Precio unitario: __________________  Plazo: __________________");
    l.gap();
  });
  return l.bytes();
}

export type CompanyData = Record<string, unknown>;
export type ClientPdfData = { name: string; taxId?: string; contactName?: string; email?: string; phone?: string; address?: string };
export type QuotePdfItem = { name: string; detail: string; quantity: string; unit: string; unitPrice: string };
export type QuotePdfData = {
  number: string; revision: number; status: string; issueDate: string; currency: string;
  clientName: string; project: string; grossSubtotal: string; netSubtotal: string; tax: string; total: string;
  locked?: boolean; lockedAt?: string; approvedAt?: string; approvedBy?: string; approvalNotes?: string; payloadJson: string;
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

function wrapText(value: unknown, maxWidth: number, size: number, bold = false): string[] {
  const paragraphs = String(value ?? "").split(/\r?\n/);
  if (paragraphs.length > 1) return paragraphs.flatMap(paragraph => wrapText(paragraph, maxWidth, size, bold));
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

  text(page: PdfPage, value: unknown, x: number, y: number, size = 9, bold = false, color: Color = NAVY, align: "left" | "right" | "center" = "left") {
    const safe = cleanText(value);
    const adjustedX = x - (align === "right" ? approximateWidth(safe, size, bold) : align === "center" ? approximateWidth(safe, size, bold) / 2 : 0);
    page.commands.push(`${color.join(" ")} rg BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${adjustedX.toFixed(2)} ${y.toFixed(2)} Tm <${winAnsiHex(safe)}> Tj ET`);
  }

  rect(page: PdfPage, x: number, y: number, width: number, height: number, fill: Color, stroke?: Color, strokeWidth = 0.6) {
    page.commands.push(`${fill.join(" ")} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
    if (stroke) page.commands.push(`${stroke.join(" ")} RG ${strokeWidth} w ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S`);
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
  let y = PAGE_HEIGHT - 32;
  const companyLine = (value: string, size: number, bold = false) => {
    for (const line of wrapText(value, PAGE_WIDTH - MARGIN * 2 - 78, size, bold)) {
      pdf.text(page, line, MARGIN + 78, y, size, bold, bold ? NAVY : SLATE);
      y -= size + 3;
    }
  };
  companyLine(name, 11.5, true);
  companyLine(companyValue(company, "tagline", "business_activity", "giro") || "Automatización · Control · Integración Industrial", 8);
  companyLine(companyValue(company, "address", "company_address") || "San Pedro de Atacama, Región de Antofagasta", 8);
  y = Math.min(y - 8, PAGE_HEIGHT - 94);
  pdf.line(page, MARGIN, y, PAGE_WIDTH - MARGIN, y, BLUE, 1.2);
  y -= 23;
  {
    const titleSize = title === "COTIZACIÓN" ? 23 : 15;
    for (const line of wrapText(title, PAGE_WIDTH - MARGIN * 2, titleSize, true)) { pdf.text(page, line, MARGIN, y, titleSize, true); y -= titleSize + 4; }
    for (const line of wrapText([number, subtitle].filter(Boolean).join(" · "), PAGE_WIDTH - MARGIN * 2, 8, true)) { pdf.text(page, line, MARGIN, y, 8, true, BLUE); y -= 11; }
  }
  return y - 12;
}

// The commercial quote follows the supplied SOLIS reference; other documents
// retain their existing layout. Header height is measured for long company data.
function drawCommercialHeader(pdf: PdfDocument, page: PdfPage, company: CompanyData) {
  pdf.logo(page, companyValue(company, "logo_jpeg") || DEFAULT_PDF_LOGO, 48, PAGE_HEIGHT - 78, 52, 52);
  let y = PAGE_HEIGHT - 42;
  const line = (value: string, size: number, bold = false) => {
    for (const text of wrapText(value, PAGE_WIDTH - MARGIN - 116, size, bold)) {
      pdf.text(page, text, 116, y, size, bold, bold ? NAVY : SLATE);
      y -= size + 4;
    }
  };
  line(companyValue(company, "commercial_name", "name", "company_name") || "SOLIS INGENIERÍA Y SERVICIOS SpA", 11.5, true);
  line(companyValue(company, "tagline", "business_activity", "giro") || "Automatización · Control · Integración Industrial", 7.6);
  line(companyValue(company, "address", "company_address") || "San Pedro de Atacama, Región de Antofagasta", 7.6);
  const ruleY = Math.min(PAGE_HEIGHT - 88, y - 8);
  pdf.line(page, MARGIN, ruleY, PAGE_WIDTH - MARGIN, ruleY, QUOTE_BLUE, 1.2);
  return ruleY - 18;
}

function footerTop(company: CompanyData) {
  return Math.max(34, 22 + footerLines(company).length * 8);
}

function footerLines(company: CompanyData) {
  const taxId = companyValue(company, "tax_id", "rut");
  const contact = [taxId ? `RUT ${taxId}` : "", companyValue(company, "email", "company_email"), companyValue(company, "phone", "company_phone")].filter(Boolean).join(" · ");
  return wrapText(contact || "SOLIS Ingeniería y Servicios SpA", 410, 6.8);
}

function drawFooter(pdf: PdfDocument, page: PdfPage, company: CompanyData, pageNumber: number, pageCount: number) {
  const top = footerTop(company);
  pdf.line(page, MARGIN, top, PAGE_WIDTH - MARGIN, top);
  footerLines(company).forEach((line, index) => pdf.text(page, line, MARGIN, top - 12 - index * 8, 6.8, false, SLATE));
  pdf.text(page, `Página ${pageNumber} de ${pageCount}`, PAGE_WIDTH - MARGIN, 20, 7.5, false, SLATE, "right");
}

type PdfCell = { value: unknown; width: number; bold?: boolean; firstParagraphBold?: boolean; fill?: Color; align?: "left" | "right" | "center"; size?: number; color?: Color };
type PdfRowStyle = { x?: number; horizontalRules?: boolean; keepTogether?: boolean; verticalCenter?: boolean; strokeWidth?: number };

// All blocks measure their actual wrapped text and split at page boundaries.
// y is the top of the next block; no fixed-height box discards text.
class PdfLayout {
  pdf = new PdfDocument();
  page!: PdfPage;
  y = 0;
  private pageTop = 0;
  left = MARGIN;
  width = PAGE_WIDTH - MARGIN * 2;
  bottom: number;
  constructor(private company: CompanyData, private title: string, private number: string, private subtitle: string, private commercial = false) {
    if (commercial) { this.left = 48; this.width = PAGE_WIDTH - 96; }
    this.bottom = Math.max(62, footerTop(company) + 18);
    this.next();
  }
  next(title = this.title) {
    this.title = title;
    this.page = this.pdf.addPage();
    this.y = this.commercial ? drawCommercialHeader(this.pdf, this.page, this.company) : drawHeader(this.pdf, this.page, this.company, title, this.number, this.subtitle);
    this.pageTop = this.y;
  }
  ensure(height: number) { if (this.y - height < this.bottom) this.next(); }
  gap(height = 12) { this.y -= height; }
  section(title: string) {
    this.ensure(42);
    this.paragraph(title, 10, true, this.commercial ? QUOTE_BLUE : BLUE);
    this.gap(5);
  }
  paragraph(value: unknown, size = 8.5, bold = false, color: Color = NAVY) {
    const lines = wrapText(value, this.width, size, bold);
    const height = lines.length * (size + 4);
    if (height <= this.pageTop - this.bottom) this.ensure(height);
    for (const line of lines) {
      this.ensure(size + 5);
      this.pdf.text(this.page, line, this.left, this.y - size, size, bold, color);
      this.y -= size + 4;
    }
  }
  row(cells: PdfCell[], boxed = true, size = 8, padding = 6, continuation?: () => void, style: PdfRowStyle = {}) {
    const lineHeight = Math.max(size, ...cells.map(cell => cell.size || size)) + 3;
    const lines = cells.map(cell => String(cell.value ?? "").split(/\r?\n/).flatMap((paragraph, index) => {
      const bold = cell.bold || Boolean(cell.firstParagraphBold && index === 0);
      return wrapText(paragraph, cell.width - padding * 2, cell.size || size, bold).map(text => ({ text, bold }));
    }));
    const length = Math.max(...lines.map(cell => cell.length));
    const wholeHeight = length * lineHeight + padding * 2;
    if (style.keepTogether && wholeHeight <= this.pageTop - this.bottom && this.y - wholeHeight < this.bottom) { this.next(); continuation?.(); }
    let offset = 0;
    while (offset < length) {
      if (this.y - lineHeight - padding * 2 < this.bottom) { this.next(); continuation?.(); }
      const count = Math.min(length - offset, Math.max(1, Math.floor((this.y - this.bottom - padding * 2) / lineHeight)));
      const height = count * lineHeight + padding * 2;
      const left = style.x ?? this.left;
      let x = left;
      cells.forEach((cell, i) => {
        if (boxed) this.pdf.rect(this.page, x, this.y - height, cell.width, height, cell.fill || WHITE, [0.78, 0.83, 0.89], style.strokeWidth);
        else if (cell.fill) this.pdf.rect(this.page, x, this.y - height, cell.width, height, cell.fill);
        const visible = lines[i].slice(offset, offset + count);
        const centering = style.verticalCenter ? Math.max(0, (count - visible.length) * lineHeight / 2) : 0;
        visible.forEach((line, index) => this.pdf.text(this.page, line.text, cell.align === "right" ? x + cell.width - padding : cell.align === "center" ? x + cell.width / 2 : x + padding, this.y - padding - (cell.size || size) - centering - index * lineHeight, cell.size || size, line.bold, cell.color || NAVY, cell.align));
        x += cell.width;
      });
      if (style.horizontalRules) this.pdf.line(this.page, left, this.y - height, x, this.y - height, [0.86, 0.88, 0.91], 0.5);
      this.y -= height;
      offset += count;
      if (offset < length) { this.next(); continuation?.(); }
    }
  }
  fields(fields: Array<{ label: string; value: unknown }>) {
    this.ensure(50);
    const width = this.width / fields.length;
    this.row(fields.map(field => ({ value: field.label.toUpperCase(), width, bold: true, color: SLATE })), false, 7, 4);
    this.row(fields.map(field => ({ value: field.value || "-", width, bold: true })), false, 9, 4);
    this.gap(10);
  }
  box(title: string, value: unknown, fill: Color = LIGHT, trailingHeight = 0) {
    const lines = wrapText(value, this.width - 24, 8.5);
    let offset = 0;
    while (offset < lines.length) {
      this.ensure(54 + trailingHeight);
      const count = Math.min(lines.length - offset, Math.max(1, Math.floor((this.y - this.bottom - 36 - trailingHeight) / 12)));
      const height = 36 + count * 12;
      this.pdf.rect(this.page, this.left, this.y - height, this.width, height, fill, [0.78, 0.83, 0.89]);
      this.pdf.text(this.page, title + (offset ? " (CONTINUACIÓN)" : ""), this.left + 12, this.y - 16, 8, true, SLATE);
      lines.slice(offset, offset + count).forEach((line, i) => this.pdf.text(this.page, line, this.left + 12, this.y - 33 - i * 12, 8.5));
      this.y -= height;
      offset += count;
      if (offset < lines.length) this.next();
    }
    this.gap();
  }
  bytes() {
    this.pdf.pages.forEach((page, index) => drawFooter(this.pdf, page, this.company, index + 1, this.pdf.pages.length));
    return this.pdf.toBytes();
  }
}

export function buildQuotePdf(input: { company: CompanyData; client?: ClientPdfData; quote: QuotePdfData; items: QuotePdfItem[] }) {
  const { company, quote, items } = input;
  const client = input.client || { name: quote.clientName };
  const payload = parsePayload(quote.payloadJson);
  const l = new PdfLayout(company, "COTIZACIÓN", quote.number, quote.status, true);
  const quoteMoney = (value: unknown) => money(value, quote.currency) + (quote.currency === "CLP" ? " CLP" : "");
  const gridStyle: PdfRowStyle = { keepTogether: true, verticalCenter: true, strokeWidth: 0.45 };
  const pairedFields = (rows: unknown[][], widths: number[]) => {
    for (const row of rows) l.row(row.map((value, index) => ({ value: value || "-", width: widths[index], bold: index % 2 === 0, fill: index % 2 === 0 ? QUOTE_LABEL : WHITE })), true, 7.2, 4, undefined, gridStyle);
  };
  l.paragraph("COTIZACIÓN", 22, true);
  l.gap(1);
  l.paragraph(quote.project, 10.3, true, QUOTE_BLUE);
  l.gap(9);
  const frozen = Boolean(quote.locked || quote.lockedAt || ["Enviada", "Aprobada"].includes(quote.status));
  pairedFields([
    ["Cliente", client.name || quote.clientName, "Fecha", quote.issueDate.split("-").reverse().join("/")],
    ["RUT", client.taxId, "Cotización", quote.number],
    ["Contacto", client.contactName || client.email, "Validez", `${payload.validityDays ?? payload.validity_days ?? 20} días corridos`],
    ["Revisión", `R${String(quote.revision).padStart(2, "0")}`, "Control", frozen ? "Versión congelada" : "Borrador editable"],
    ["Teléfono", client.phone, "Correo", client.email],
  ], [54, 204, 54, l.width - 312]);
  pairedFields([["Dirección", client.address]], [54, l.width - 54]);
  l.gap(16);
  const widths = [28, 215, 40, 48, 82, l.width - 413];
  const tableHeader = () => {
    l.section("OFERTA ECONÓMICA");
    l.row(["Ítem", "Descripción", "Cant.", "Unidad", "P. unitario", "Total neto"].map((value, index) => ({ value, width: widths[index], bold: true, fill: QUOTE_BLUE, color: WHITE, align: "center" })), true, 7.2, 4, undefined, { strokeWidth: 0.45 });
  };
  tableHeader();
  items.forEach((item, index) => {
    const values = [index + 1, `${item.name}${item.detail ? `\n${item.detail}` : ""}`, Number(item.quantity).toLocaleString("es-CL", { maximumFractionDigits: 4 }), item.unit, quoteMoney(item.unitPrice), quoteMoney(Number(item.unitPrice) * Number(item.quantity))];
    l.row(values.map((value, column) => ({ value, width: widths[column], firstParagraphBold: column === 1, fill: index % 2 ? QUOTE_ALTERNATE : WHITE, align: column >= 4 ? "right" : column === 1 ? "left" : "center" })), true, 7.2, 4, tableHeader, gridStyle);
  });
  l.gap(4);
  const discountPercent = Number(payload.discountPercent ?? payload.discount_percent ?? 0);
  const taxPercent = Number(payload.taxPercent ?? payload.tax_percent ?? 19);
  const discount = Math.max(0, Number(quote.grossSubtotal) - Number(quote.netSubtotal));
  const totals: Array<[string, unknown]> = [
    ...(discount > 0.0001 ? [["Subtotal bruto", quote.grossSubtotal], [`Descuento${discountPercent ? ` ${discountPercent}%` : ""}`, -discount]] as Array<[string, unknown]> : []),
    ["Subtotal neto", quote.netSubtotal], [`IVA ${taxPercent}%`, quote.tax], ["TOTAL IVA INCLUIDO", quote.total],
  ];
  const summaryWidth = 227, labelWidth = 104, amountWidth = summaryWidth - labelWidth;
  const summaryLeft = l.left + l.width - summaryWidth;
  const summaryRows = totals.map(([label, value], index) => {
    const last = index === totals.length - 1, size = last ? 7.4 : 7.2;
    const formatted = quoteMoney(value);
    const count = Math.max(wrapText(label, labelWidth - 10, size, last).length, wrapText(formatted, amountWidth - 10, size, last).length);
    return { label, formatted, last, size, height: count * (size + 3) + 10 };
  });
  l.ensure(summaryRows.reduce((sum, row) => sum + row.height, 0));
  summaryRows.forEach(({ label, formatted, size, last }) => l.row([
    { value: label, width: labelWidth, bold: last, fill: last ? QUOTE_TOTAL : QUOTE_LABEL },
    { value: formatted, width: amountWidth, bold: last, align: "right", fill: last ? QUOTE_TOTAL : QUOTE_LABEL },
  ], true, size, 5, undefined, { x: summaryLeft, strokeWidth: 0.45 }));
  l.gap(12);
  l.section("CONDICIONES COMERCIALES");
  pairedFields([
    ["Forma de pago", payload.paymentTerms ?? payload.payment_terms ?? "Por definir", "Plazo", payload.deliveryTerms ?? payload.delivery_terms ?? "Por definir"],
    ["Moneda", `${quote.currency} - valores netos`, "Estado", quote.status],
  ], [70, 174, 52, l.width - 296]);
  const validation = payload.technicalValidation ?? payload.technical_validation;
  if (cleanText(validation)) { l.gap(); l.box("VALIDACIÓN TÉCNICA", validation, [1, 0.97, 0.85]); }
  for (const [label, value] of [["ALCANCE Y EXCLUSIONES", payload.scopeExclusions], ["OBSERVACIONES", payload.notes]]) {
    if (cleanText(value)) { l.gap(12); l.section(label); l.paragraph(value, 8); }
  }
  // An explicit empty canonical field means the user cleared an older alias.
  const bankValue = (...keys: string[]) => {
    for (const key of keys) if (company[key] !== undefined && company[key] !== null) return cleanText(company[key]);
    return "";
  };
  const holder = bankValue("bank_account_holder", "account_holder", "bank_holder");
  const bank = bankValue("bank_name", "bank", "banco");
  const account = bankValue("bank_account_number", "account_number");
  const accountType = bankValue("bank_account_type", "account_type");
  if (holder || bank || account || accountType) {
    const bankRows = [
      ["Titular", holder || companyValue(company, "commercial_name", "name"), "RUT", bankValue("bank_account_tax_id", "account_tax_id") || companyValue(company, "tax_id", "rut")],
      ["Banco", bank, "Tipo de cuenta", accountType],
      ["N° de cuenta", account, "Correo", bankValue("bank_notification_email", "payment_email") || companyValue(company, "email", "company_email")],
    ];
    const bankWidths = [63, 181, 74, l.width - 318];
    const bankHeight = bankRows.reduce((sum, row) => sum + Math.max(...row.map((value, index) => wrapText(value || "-", bankWidths[index] - 8, 7.2, index % 2 === 0).length)) * 10.2 + 8, 0);
    l.gap(12); l.ensure(bankHeight + 19); l.section("DATOS DE PAGO");
    pairedFields(bankRows, bankWidths);
  }
  const representative = companyValue(company, "representative", "contact_name") || "Responsable comercial";
  const role = companyValue(company, "representative_title", "representative_role");
  const signatures: PdfCell[] = [
    { value: `Por ${companyValue(company, "commercial_name", "name") || "SOLIS Ingeniería y Servicios SpA"}\n${representative}${role ? `\n${role}` : ""}\n\nFirma: __________________________`, width: l.width / 2 },
    { value: "Aceptación del cliente\n\n\nNombre y firma: _____________________", width: l.width / 2 },
  ];
  const signatureHeight = Math.max(...signatures.map(cell => wrapText(cell.value, cell.width - 12, 8).length)) * 11 + 12;
  l.ensure(signatureHeight + 18); l.gap(18);
  l.row(signatures, false, 8, 6, undefined, { keepTogether: true });
  return l.bytes();
}

export function buildPurchaseOrderPdf(input: { company: CompanyData; supplier: SupplierPdfData; purchase: PurchasePdfData; items: PurchasePdfItem[] }) {
  const { company, supplier, purchase, items } = input;
  const l = new PdfLayout(company, "ORDEN DE COMPRA", purchase.number, purchase.status);
  l.fields([{ label: "Proveedor", value: supplier.name || purchase.supplier }, { label: "RUT", value: supplier.taxId }, { label: "Moneda", value: purchase.currency }]);
  l.fields([{ label: "Contacto", value: supplier.contactName || supplier.email }, { label: "Condición de pago", value: supplier.paymentTerms || "Por definir" }, { label: "Fecha", value: (purchase.orderedAt || purchase.approvedAt || purchase.createdAt).slice(0, 10) }]);
  if (purchase.workOrderNumber || purchase.project) l.fields([{ label: "Destino", value: [purchase.workOrderNumber, purchase.project].filter(Boolean).join(" · ") }]);
  const widths = [263, 43, 38, 83, l.width - 427];
  const heading = () => l.row(["DESCRIPCIÓN", "CANT.", "UN.", "COSTO UNIT.", "TOTAL"].map((value, i) => ({ value, width: widths[i], bold: true, fill: PALE_BLUE })), true, 7, 4);
  heading();
  for (const item of items) l.row([item.description, item.quantity, item.unit, money(item.unitCost, purchase.currency), money(item.lineTotal, purchase.currency)].map((value, i) => ({ value, width: widths[i], bold: i === 4, align: i >= 3 ? "right" : "left" })), true, 8, 5, heading);
  l.gap(18); l.ensure(170);
  const totals = [
    ["Subtotal", money(purchase.subtotal, purchase.currency)],
    [`Descuento (${Number(purchase.discountPercent || 0)}%)`, money(purchase.discountAmount, purchase.currency)],
    ...(Number(purchase.dispatchNet || 0) ? [["Despacho neto", money(purchase.dispatchNet || "0", purchase.currency)]] : []),
    ["Neto", money(purchase.netSubtotal, purchase.currency)],
    [`Impuesto (${Number(purchase.taxPercent || 0)}%)`, money(purchase.taxAmount, purchase.currency)],
    ["TOTAL", money(purchase.total, purchase.currency)],
  ];
  for (const [label, value] of totals) l.row([{ value: label, width: l.width / 2, fill: PALE_BLUE, bold: true }, { value, width: l.width / 2, fill: PALE_BLUE, bold: true, align: "right" }]);
  l.gap(18); l.section("APROBACIÓN INTERNA");
  l.paragraph(`${purchase.approvedBy || "Pendiente"}${purchase.approvedAt ? ` · ${purchase.approvedAt.slice(0, 16).replace("T", " ")}` : ""}`, 9, true);
  if (purchase.approvalNotes) l.paragraph(purchase.approvalNotes);
  l.gap(); l.box("OBSERVACIONES", purchase.notes || "Sin observaciones.", LIGHT, 40);
  l.paragraph("Documento interno de abastecimiento. Los costos se cargan a la orden al entregar el material, no al recibir la compra.", 7.5, false, SLATE);
  return l.bytes();
}

export function buildWorkOrderPdf(input: { company: CompanyData; order: WorkOrderPdfData; quote: QuotePdfData; items: QuotePdfItem[]; execution?: WorkOrderExecutionPdfData }) {
  const { company, order, quote, items, execution } = input;
  const l = new PdfLayout(company, "ORDEN DE TRABAJO", order.number, `Origen: ${quote.number}`);
  l.fields([{ label: "Cliente", value: order.clientName }, { label: "Proyecto", value: order.project }]);
  l.fields([{ label: "Responsable", value: order.responsible || "Sin asignar" }, { label: "Estado / prioridad", value: `${order.status} · ${order.priority || "Normal"}` }, { label: "Fecha", value: order.createdDate }]);
  l.fields([{ label: "Inicio planificado", value: order.plannedStart || "Por definir" }, { label: "Fin planificado", value: order.plannedEnd || "Por definir" }, { label: "Compromiso", value: order.dueDate || "Por definir" }]);
  l.section("ALCANCE APROBADO");
  items.forEach((item, index) => l.row([{ value: `${index + 1}. ${item.name}${item.detail ? `\n${item.detail}` : ""}`, width: l.width - 85 }, { value: `${item.quantity} ${item.unit}`, width: 85, bold: true, align: "right" }]));
  l.gap(); l.box("INSTRUCCIONES OPERATIVAS", order.notes || "Sin instrucciones adicionales.");
  if (execution && (execution.activities.length || execution.entries.length || execution.evidence.length || execution.signoff || execution.materialRequests?.length)) {
    l.next("INFORME DE EJECUCIÓN");
    const required = execution.activities.filter(activity => activity.required);
    const completed = required.filter(activity => activity.completed).length;
    const progress = required.length ? Math.round(completed / required.length * 100) : 0;
    const hours = execution.entries.filter(entry => entry.type === "hours").reduce((sum, entry) => sum + entry.quantity, 0);
    l.fields([{ label: "Avance obligatorio", value: `${progress}% (${completed}/${required.length})` }, { label: "Horas registradas", value: String(hours) }, { label: "Evidencias", value: String(execution.evidence.length) }]);
    l.section("CHECKLIST DE TERRENO");
    for (const activity of execution.activities) {
      l.paragraph(`${activity.completed ? "[OK]" : "[  ]"} ${activity.title}${activity.required ? " *" : ""}`, 8.5, activity.completed, activity.completed ? [0.08, 0.45, 0.26] : SLATE); l.gap(4);
    }
    if (execution.entries.length) {
      l.gap(); l.section("REGISTROS REALES");
      for (const entry of execution.entries) {
        l.paragraph(`${entry.entryDate} · ${entry.type.toUpperCase()} · ${entry.description} · ${entry.quantity} ${entry.unit}`, 8); l.gap(5);
      }
    }
    if (execution.evidence.length) {
      l.gap(); l.section("EVIDENCIAS REGISTRADAS");
      for (const evidence of execution.evidence) { l.paragraph(`${evidence.createdAt.slice(0, 16).replace("T", " ")} · ${evidence.caption || "Sin descripción"}`, 8); l.gap(4); }
    }
    if (execution.signoff) {
      l.gap();
      l.box("CONFORMIDAD OPERATIVA REGISTRADA", `${execution.signoff.customerName}${execution.signoff.customerRole ? ` · ${execution.signoff.customerRole}` : ""}\n${execution.signoff.signedAt.slice(0, 16).replace("T", " ")} · Firma capturada en la PWA\n${execution.signoff.notes || ""}`);
    }
    if (execution.materialRequests?.length) {
      l.next("SOLICITUDES DE MATERIALES"); l.section("TRAZABILIDAD DE ABASTECIMIENTO");
      for (const request of execution.materialRequests) {
        l.ensure(65);
        l.paragraph(`${request.status} · ${request.urgency}${request.neededDate ? ` · requerido ${request.neededDate}` : ""} · ${request.activityTitle}`, 8, request.status === "Entregada");
        l.paragraph(`Solicita: ${request.requestedBy}`, 8);
        for (const item of request.items) l.paragraph(`${item.quantity} ${item.unit} ${item.description}`, 8);
        l.gap(10);
      }
    }
  }
  l.gap(); l.paragraph(`Aprobación comercial: ${quote.approvedBy || "registrada"}${quote.approvedAt ? ` · ${quote.approvedAt.slice(0, 10)}` : ""}`, 7.5, false, SLATE);
  return l.bytes();
}

export function buildClosureReportPdf(input: { company: CompanyData; closure: ClosurePdfData }) {
  const { company, closure } = input;
  const l = new PdfLayout(company, "CIERRE DE ORDEN", closure.number, "Informe interno de rentabilidad real");
  l.fields([{ label: "Cliente", value: closure.clientName }, { label: "Proyecto", value: closure.project }]);
  l.fields([{ label: "Cerrada por", value: closure.closedBy }, { label: "Fecha de cierre", value: closure.closedAt.slice(0, 16).replace("T", " ") }]);
  l.section("RESULTADO ECONÓMICO FINAL");
  const metrics = [["Venta aprobada", money(closure.sale, closure.currency)], ["Costo presupuestado", money(closure.budgetedCost, closure.currency)], ["Costo real", money(closure.actualCost, closure.currency)], ["Utilidad real", money(closure.actualProfit, closure.currency)], ["Margen real", `${closure.actualMarginPercent.toFixed(2)}%`], ["Desviación de costo", money(closure.budgetVariance, closure.currency)]];
  for (const [label, value] of metrics) l.row([{ value: label, width: l.width / 2, fill: LIGHT }, { value, width: l.width / 2, bold: true, align: "right", fill: LIGHT }]);
  l.gap(); l.section("COMPOSICIÓN DEL COSTO REAL");
  const labels: Record<string, string> = { hours: "Mano de obra", material: "Materiales", service: "Servicios", expense: "Otros gastos", note: "Observaciones" };
  const breakdown = Object.entries(closure.breakdown).filter(([, value]) => value !== 0);
  if (!breakdown.length) l.paragraph("Sin costos monetarios registrados.");
  for (const [key, value] of breakdown) l.row([{ value: labels[key] || key, width: l.width * 0.65 }, { value: money(value, closure.currency), width: l.width * 0.35, bold: true, align: "right" }], false);
  l.gap(); l.section("CONTROL DE CIERRE");
  for (const value of [`${closure.counts.activities} actividades registradas`, `${closure.counts.materialRequests} solicitudes de material resueltas`, `${closure.counts.purchases} procesos de compra cerrados`, `${closure.counts.signoffs} conformidad(es) del cliente`]) l.paragraph(`[OK] ${value}`, 8.5, true, [0.08, 0.45, 0.26]);
  l.gap(); l.box("NOTA DE CIERRE", closure.closureNotes || "Sin observaciones.", LIGHT, 40);
  l.paragraph("Documento interno. La orden y sus costos quedaron congelados al cerrar.", 7.5, false, SLATE);
  return l.bytes();
}

export function buildCollectionDocumentPdf(input: { company: CompanyData; document: CollectionPdfData }) {
  const { company, document } = input;
  const l = new PdfLayout(company, "DOCUMENTO DE COBRO", document.number, `${document.concept} · ${document.status}`);
  l.fields([{ label: "Cliente", value: document.clientName }, { label: "Proyecto", value: document.project }]);
  l.fields([{ label: "Emisión", value: document.issueDate }, { label: "Vencimiento", value: document.dueDate }, { label: "Moneda", value: document.currency }]);
  l.section("RESUMEN DEL COBRO");
  for (const [label, value] of [["Monto neto", money(document.netAmount, document.currency)], [`IVA referencial (${document.taxPercent}%)`, money(document.taxAmount, document.currency)], ["Total documento", money(document.totalAmount, document.currency)], ["Pagos recibidos", money(document.paidAmount, document.currency)], ["SALDO PENDIENTE", money(document.balance, document.currency)]]) l.row([{ value: label, width: l.width / 2, fill: PALE_BLUE, bold: true }, { value, width: l.width / 2, bold: true, fill: PALE_BLUE, align: "right" }]);
  l.gap(); l.section("PAGOS REGISTRADOS");
  if (!document.payments.length) l.paragraph("Aún no existen pagos registrados.");
  for (const payment of document.payments) l.row([{ value: `${payment.paymentDate} · ${payment.method} · ${payment.reference}`, width: l.width * 0.7 }, { value: money(payment.amount, document.currency), width: l.width * 0.3, bold: true, align: "right" }]);
  l.gap(); l.box("OBSERVACIONES", document.notes || "Sin observaciones.", LIGHT, 40);
  l.paragraph("Documento interno de cobro y seguimiento. No reemplaza una factura electrónica DTE autorizada por el SII.", 7.5, false, SLATE);
  return l.bytes();
}

export function buildOrderMaterialsPdf(data: OrderMaterialsData) {
  const l = new PdfLayout(data.company, "MATERIALES DE TRABAJO", data.order.number, data.quoteNumber);
  l.paragraph(`${data.order.clientName} · ${data.order.project}`, 9, true);
  l.paragraph(`Responsable: ${data.order.responsible || "Por asignar"} · Estado: ${data.order.status}`);
  l.paragraph(`Consulta: ${data.preparedAt.slice(0, 16).replace("T", " ")} UTC. Verifique cambios posteriores antes de retirar materiales.`);
  l.gap();
  const material = (item: { description: string; quantity: number; unit: string; code?: string; specification?: string; brand?: string }, index: number) => {
    l.ensure(100);
    l.paragraph(`${index + 1}. ${item.code ? item.code + " · " : ""}${item.description}`, 8.5, true);
    if (item.specification || item.brand) l.paragraph([item.brand, item.specification].filter(Boolean).join(" / "));
    l.paragraph(`Cantidad: ${item.quantity.toLocaleString("es-CL")} ${item.unit}     Entregado: __________     Fecha: __________`);
    l.paragraph("Observación: __________________________________________________________________"); l.gap();
  };
  for (const group of data.groups) { l.section(group.title); group.materials.forEach(material); }
  if (data.requests.length) {
    l.section("SOLICITUDES DE TERRENO");
    l.paragraph("Se muestran por separado. Pueden coincidir con el presupuesto; no sumarlas automáticamente.");
    for (const request of data.requests) { l.section(`Solicitud ${request.number} · ${request.status}`); request.items.forEach(material); }
  }
  if (!data.groups.length && !data.requests.length) l.paragraph("Esta orden aún no tiene materiales desglosados.");
  l.gap(); l.ensure(50);
  l.paragraph("Entrega de bodega: _____________________    Recibe: _____________________", 8.5, true);
  l.paragraph("Fecha: _____________________    Firma: _____________________");
  return l.bytes();
}

export function buildAccountingRequestPdf(packet: AccountingPacket) {
  const company = { commercial_name: packet.issuer.name, tax_id: packet.issuer.taxId, address: packet.issuer.address, email: packet.issuer.email, phone: packet.issuer.phone };
  const l = new PdfLayout(company, "SOLICITUD DE FACTURACIÓN", packet.number, packet.billingNumber);
  for (const paragraph of accountingText(packet).split("\n")) {
    l.paragraph(paragraph, 9, paragraph.startsWith("SOLICITUD INTERNA") || paragraph.startsWith("Total:")); l.gap(5);
  }
  l.gap(); l.paragraph(`Preparada por ${packet.preparedBy} · ${packet.preparedAt.slice(0, 10)}`, 8, false, SLATE);
  return l.bytes();
}
