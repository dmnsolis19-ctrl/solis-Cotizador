const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const AMBER = [0.96, 0.68, 0.05] as const;
const NAVY = [0.06, 0.09, 0.16] as const;
const SLATE = [0.28, 0.33, 0.41] as const;
const LIGHT = [0.95, 0.96, 0.97] as const;

type PdfPage = { commands: string[] };
type Color = readonly [number, number, number];

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
  subtotal: string; discountAmount: string; discountPercent: string; netSubtotal: string;
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

function approximateWidth(value: string, size: number) {
  let units = 0;
  for (const char of value) units += /[MWÁÉÍÓÚÑ]/.test(char) ? 0.82 : /[ilI1.,:;!' ]/.test(char) ? 0.28 : 0.53;
  return units * size;
}

function wrapText(value: unknown, maxWidth: number, size: number) {
  const words = cleanText(value).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (approximateWidth(candidate, size) <= maxWidth) current = candidate;
    else {
      if (current) lines.push(current);
      if (approximateWidth(word, size) <= maxWidth) current = word;
      else {
        const maxChars = Math.max(4, Math.floor(maxWidth / (size * 0.54)));
        for (let i = 0; i < word.length; i += maxChars) lines.push(word.slice(i, i + maxChars));
        current = "";
      }
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

class PdfDocument {
  pages: PdfPage[] = [];

  addPage() {
    const page = { commands: [] };
    this.pages.push(page);
    return page;
  }

  text(page: PdfPage, value: unknown, x: number, y: number, size = 9, bold = false, color: Color = NAVY, align: "left" | "right" = "left") {
    const safe = cleanText(value);
    const adjustedX = align === "right" ? x - approximateWidth(safe, size) : x;
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
    objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
    objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
    this.pages.forEach((page, index) => {
      const contentId = 5 + index * 2;
      const pageId = 6 + index * 2;
      const stream = page.commands.join("\n");
      objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    });
    let output = "%PDF-1.7\n%SOLIS\n";
    const offsets = [0];
    for (let id = 1; id < objects.length; id += 1) {
      offsets[id] = new TextEncoder().encode(output).length;
      output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xrefOffset = new TextEncoder().encode(output).length;
    output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id += 1) output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
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
  pdf.rect(page, 0, PAGE_HEIGHT - 92, PAGE_WIDTH, 92, NAVY);
  pdf.rect(page, MARGIN, PAGE_HEIGHT - 70, 34, 34, AMBER);
  pdf.text(page, "S", MARGIN + 11, PAGE_HEIGHT - 60, 18, true, NAVY);
  pdf.text(page, companyValue(company, "commercial_name", "name", "company_name") || "SOLIS Ingeniería y Servicios", MARGIN + 45, PAGE_HEIGHT - 47, 11, true, [1, 1, 1]);
  pdf.text(page, companyValue(company, "tax_id", "rut"), MARGIN + 45, PAGE_HEIGHT - 64, 8, false, [0.72, 0.77, 0.84]);
  pdf.text(page, title, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 43, 15, true, [1, 1, 1], "right");
  pdf.text(page, number, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 61, 10, true, AMBER, "right");
  pdf.text(page, subtitle, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 76, 8, false, [0.72, 0.77, 0.84], "right");
}

function drawFooter(pdf: PdfDocument, page: PdfPage, company: CompanyData, pageNumber: number, pageCount: number) {
  pdf.line(page, MARGIN, 34, PAGE_WIDTH - MARGIN, 34);
  const contact = [companyValue(company, "email", "company_email"), companyValue(company, "phone", "company_phone")].filter(Boolean).join(" · ");
  pdf.text(page, contact || "SOLIS Ingeniería y Servicios SpA", MARGIN, 20, 7.5, false, SLATE);
  pdf.text(page, `Página ${pageNumber} de ${pageCount}`, PAGE_WIDTH - MARGIN, 20, 7.5, false, SLATE, "right");
}

function labelValue(pdf: PdfDocument, page: PdfPage, label: string, value: unknown, x: number, y: number, width: number) {
  pdf.text(page, label.toUpperCase(), x, y, 7, true, SLATE);
  const lines = wrapText(value || "-", width, 10).slice(0, 2);
  lines.forEach((line, index) => pdf.text(page, line, x, y - 15 - index * 12, 10, index === 0, NAVY));
}

function addQuoteTableHeader(pdf: PdfDocument, page: PdfPage, y: number) {
  pdf.rect(page, MARGIN, y - 19, PAGE_WIDTH - MARGIN * 2, 23, LIGHT);
  pdf.text(page, "PARTIDA / DESCRIPCIÓN", MARGIN + 7, y - 10, 7.5, true, SLATE);
  pdf.text(page, "CANT.", 392, y - 10, 7.5, true, SLATE, "right");
  pdf.text(page, "UN.", 425, y - 10, 7.5, true, SLATE, "right");
  pdf.text(page, "PRECIO UNIT.", 500, y - 10, 7.5, true, SLATE, "right");
  pdf.text(page, "TOTAL", PAGE_WIDTH - MARGIN - 7, y - 10, 7.5, true, SLATE, "right");
  return y - 26;
}

export function buildQuotePdf(input: { company: CompanyData; client?: ClientPdfData; quote: QuotePdfData; items: QuotePdfItem[] }) {
  const { company, quote, items } = input;
  const client = input.client || { name: quote.clientName };
  const payload = parsePayload(quote.payloadJson);
  const pdf = new PdfDocument();
  let page = pdf.addPage();
  const subtitle = quote.revision ? `Revisión R${String(quote.revision).padStart(2, "0")} · ${quote.status}` : quote.status;
  drawHeader(pdf, page, company, "COTIZACIÓN", quote.number, subtitle);
  let y = PAGE_HEIGHT - 118;
  labelValue(pdf, page, "Cliente", client.name || quote.clientName, MARGIN, y, 235);
  labelValue(pdf, page, "Proyecto", quote.project, 310, y, 240);
  y -= 54;
  labelValue(pdf, page, "RUT", client.taxId || "-", MARGIN, y, 150);
  labelValue(pdf, page, "Contacto", client.contactName || client.email || "-", 205, y, 190);
  labelValue(pdf, page, "Emisión", quote.issueDate, 430, y, 120);
  y -= 55;
  y = addQuoteTableHeader(pdf, page, y);

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const description = wrapText([item.name, item.detail].filter(Boolean).join(" - "), 292, 8.5).slice(0, 4);
    const rowHeight = Math.max(28, description.length * 11 + 10);
    if (y - rowHeight < 116) {
      page = pdf.addPage();
      drawHeader(pdf, page, company, "COTIZACIÓN", quote.number, subtitle);
      y = addQuoteTableHeader(pdf, page, PAGE_HEIGHT - 116);
    }
    pdf.text(page, String(index + 1).padStart(2, "0"), MARGIN + 7, y - 10, 8, true, SLATE);
    description.forEach((line, lineIndex) => pdf.text(page, line, MARGIN + 29, y - 10 - lineIndex * 11, 8.5, lineIndex === 0));
    pdf.text(page, item.quantity, 392, y - 10, 8.5, false, NAVY, "right");
    pdf.text(page, item.unit, 425, y - 10, 8.5, false, NAVY, "right");
    pdf.text(page, money(item.unitPrice, quote.currency), 500, y - 10, 8.5, false, NAVY, "right");
    pdf.text(page, money(Number(item.unitPrice) * Number(item.quantity), quote.currency), PAGE_WIDTH - MARGIN - 7, y - 10, 8.5, true, NAVY, "right");
    pdf.line(page, MARGIN, y - rowHeight, PAGE_WIDTH - MARGIN, y - rowHeight);
    y -= rowHeight;
  }

  if (y < 258) {
    page = pdf.addPage();
    drawHeader(pdf, page, company, "COTIZACIÓN", quote.number, subtitle);
    y = PAGE_HEIGHT - 122;
  }
  const discountPercent = Number(payload.discountPercent ?? payload.discount_percent ?? 0);
  const discountValue = Math.max(0, Number(quote.grossSubtotal) - Number(quote.netSubtotal));
  const totalsX = 340;
  const totals = [
    ["Subtotal", money(quote.grossSubtotal, quote.currency)],
    [`Descuento${discountPercent ? ` (${discountPercent}%)` : ""}`, money(discountValue, quote.currency)],
    ["Neto", money(quote.netSubtotal, quote.currency)],
    ["IVA", money(quote.tax, quote.currency)],
  ];
  totals.forEach(([label, value], index) => {
    pdf.text(page, label, totalsX, y - 9 - index * 19, 8.5, false, SLATE);
    pdf.text(page, value, PAGE_WIDTH - MARGIN, y - 9 - index * 19, 9, true, NAVY, "right");
  });
  const totalY = y - 87;
  pdf.rect(page, totalsX - 8, totalY - 19, PAGE_WIDTH - MARGIN - totalsX + 8, 32, NAVY);
  pdf.text(page, "TOTAL", totalsX, totalY - 8, 9, true, [1, 1, 1]);
  pdf.text(page, money(quote.total, quote.currency), PAGE_WIDTH - MARGIN - 8, totalY - 8, 12, true, AMBER, "right");

  const termsY = Math.min(y - 4, totalY - 46);
  pdf.text(page, "CONDICIONES COMERCIALES", MARGIN, termsY, 8, true, SLATE);
  const terms = [
    `Validez: ${payload.validityDays ?? payload.validity_days ?? 20} días`,
    `Forma de pago: ${payload.paymentTerms ?? payload.payment_terms ?? "Por definir"}`,
    `Plazo de entrega: ${payload.deliveryTerms ?? payload.delivery_terms ?? "Por definir"}`,
  ];
  terms.forEach((term, index) => pdf.text(page, `• ${term}`, MARGIN, termsY - 17 - index * 13, 8.5));
  const notes = cleanText(payload.notes);
  if (notes) wrapText(notes, 280, 8.5).slice(0, 4).forEach((line, index) => pdf.text(page, line, MARGIN, termsY - 64 - index * 12, 8.5, false, SLATE));
  pdf.text(page, `Valores expresados en ${quote.currency}. Documento comercial generado desde SOLIS Cotizador PWA.`, MARGIN, 49, 7.5, false, SLATE);
  pdf.pages.forEach((currentPage, index) => drawFooter(pdf, currentPage, company, index + 1, pdf.pages.length));
  return pdf.toBytes();
}

export function buildPurchaseOrderPdf(input: { company: CompanyData; supplier: SupplierPdfData; purchase: PurchasePdfData; items: PurchasePdfItem[] }) {
  const { company, supplier, purchase, items } = input;
  const pdf = new PdfDocument();
  let page = pdf.addPage();
  drawHeader(pdf, page, company, "ORDEN DE COMPRA", purchase.number, purchase.status);
  let y = PAGE_HEIGHT - 118;
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
    const lines = wrapText(item.description, 285, 8.5).slice(0, 3);
    const rowHeight = Math.max(28, lines.length * 11 + 10);
    if (y - rowHeight < 165) {
      page = pdf.addPage();
      drawHeader(pdf, page, company, "ORDEN DE COMPRA", purchase.number, "Continuación");
      y = PAGE_HEIGHT - 120;
    }
    lines.forEach((line, index) => pdf.text(page, line, MARGIN + 7, y - 10 - index * 11, 8.5, index === 0));
    pdf.text(page, item.quantity, 380, y - 10, 8.5, false, NAVY, "right");
    pdf.text(page, item.unit, 420, y - 10, 8.5, false, NAVY, "right");
    pdf.text(page, money(item.unitCost, purchase.currency), 500, y - 10, 8.5, false, NAVY, "right");
    pdf.text(page, money(item.lineTotal, purchase.currency), PAGE_WIDTH - MARGIN - 7, y - 10, 8.5, true, NAVY, "right");
    pdf.line(page, MARGIN, y - rowHeight, PAGE_WIDTH - MARGIN, y - rowHeight);
    y -= rowHeight;
  }
  if (y < 270) {
    page = pdf.addPage();
    drawHeader(pdf, page, company, "ORDEN DE COMPRA", purchase.number, "Resumen y aprobación");
    y = PAGE_HEIGHT - 125;
  }
  const totals = [
    ["Subtotal", money(purchase.subtotal, purchase.currency)],
    [`Descuento (${Number(purchase.discountPercent || 0)}%)`, money(purchase.discountAmount, purchase.currency)],
    ["Neto", money(purchase.netSubtotal, purchase.currency)],
    [`Impuesto (${Number(purchase.taxPercent || 0)}%)`, money(purchase.taxAmount, purchase.currency)],
  ];
  totals.forEach(([label, value], index) => {
    pdf.text(page, label, 340, y - index * 19, 8.5, false, SLATE);
    pdf.text(page, value, PAGE_WIDTH - MARGIN, y - index * 19, 9, true, NAVY, "right");
  });
  const totalY = y - 82;
  pdf.rect(page, 332, totalY - 18, PAGE_WIDTH - MARGIN - 332, 32, NAVY);
  pdf.text(page, "TOTAL", 340, totalY - 7, 9, true, [1, 1, 1]);
  pdf.text(page, money(purchase.total, purchase.currency), PAGE_WIDTH - MARGIN - 8, totalY - 7, 12, true, AMBER, "right");
  const approvalY = totalY - 52;
  pdf.text(page, "APROBACIÓN INTERNA", MARGIN, approvalY, 8, true, SLATE);
  pdf.text(page, `${purchase.approvedBy || "Pendiente"}${purchase.approvedAt ? ` · ${purchase.approvedAt.slice(0, 16).replace("T", " ")}` : ""}`, MARGIN, approvalY - 17, 9, true);
  if (purchase.approvalNotes) wrapText(purchase.approvalNotes, 250, 8).slice(0, 3).forEach((line, index) => pdf.text(page, line, MARGIN, approvalY - 34 - index * 11, 8, false, SLATE));
  const notesY = approvalY - 82;
  pdf.text(page, "OBSERVACIONES", MARGIN, notesY, 8, true, SLATE);
  wrapText(purchase.notes || "Sin observaciones.", PAGE_WIDTH - MARGIN * 2, 8).slice(0, 4).forEach((line, index) => pdf.text(page, line, MARGIN, notesY - 17 - index * 11, 8));
  pdf.text(page, "Documento interno de abastecimiento. Los costos se cargan a la orden al entregar el material, no al recibir la compra.", MARGIN, 49, 7.5, false, SLATE);
  pdf.pages.forEach((currentPage, index) => drawFooter(pdf, currentPage, company, index + 1, pdf.pages.length));
  return pdf.toBytes();
}

export function buildWorkOrderPdf(input: { company: CompanyData; order: WorkOrderPdfData; quote: QuotePdfData; items: QuotePdfItem[]; execution?: WorkOrderExecutionPdfData }) {
  const { company, order, quote, items, execution } = input;
  const pdf = new PdfDocument();
  let page = pdf.addPage();
  drawHeader(pdf, page, company, "ORDEN DE TRABAJO", order.number, `Origen: ${quote.number}`);
  let y = PAGE_HEIGHT - 118;
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
      y = PAGE_HEIGHT - 118;
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
    y = PAGE_HEIGHT - 120;
  }
  pdf.rect(page, MARGIN, y - 104, PAGE_WIDTH - MARGIN * 2, 112, LIGHT, [0.86, 0.88, 0.91]);
  pdf.text(page, "INSTRUCCIONES OPERATIVAS", MARGIN + 12, y - 14, 8, true, SLATE);
  wrapText(notes || "Sin instrucciones adicionales.", PAGE_WIDTH - MARGIN * 2 - 24, 8.5).slice(0, 6).forEach((line, index) => pdf.text(page, line, MARGIN + 12, y - 31 - index * 12, 8.5));
  if (execution && (execution.activities.length || execution.entries.length || execution.evidence.length || execution.signoff)) {
    page = pdf.addPage();
    drawHeader(pdf, page, company, "INFORME DE EJECUCIÓN", order.number, `Origen: ${quote.number}`);
    y = PAGE_HEIGHT - 122;
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
      y = PAGE_HEIGHT - 122;
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
  let y = PAGE_HEIGHT - 118;
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
  let y = PAGE_HEIGHT - 118;
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
