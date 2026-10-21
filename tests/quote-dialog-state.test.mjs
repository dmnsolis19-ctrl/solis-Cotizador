import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import * as React from "react";

// Execute the real dialog and its event handlers with an in-memory hook scheduler.
// This exercises state/effect lifetimes without a DOM or a browser dependency.
const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
globalThis.__quoteRealReact = React;
const vite = await createServer({ appType: "custom", configFile: false, root,
  resolve: { alias: [{ find: /^react$/, replacement: "virtual:quote-hooks" }, { find: "@/lib/offline-queue", replacement: "virtual:quote-offline" }, { find: "@", replacement: root }] },
  server: { middlewareMode: true },
  plugins: [{ name: "quote-dialog-state-test", resolveId(id) { if (id === "virtual:quote-hooks" || id === "virtual:quote-offline") return `\0${id}`; }, load(id) {
    if (id === "\0virtual:quote-hooks") return `export default globalThis.__quoteRealReact; ${Object.keys(React).filter(key => /^[A-Za-z_$][\w$]*$/.test(key) && !["default", "useState", "useEffect"].includes(key)).map(key => `export const ${key}=globalThis.__quoteRealReact[${JSON.stringify(key)}];`).join(" ")} export const useState=(...a)=>globalThis.__quoteHooks.useState(...a); export const useEffect=(...a)=>globalThis.__quoteHooks.useEffect(...a);`;
    if (id === "\0virtual:quote-offline") return `export * from ${JSON.stringify(root + "/lib/offline-queue.ts")}; export const cachedApi=(url)=>globalThis.__quoteApi(url);`;
  }, transform(code, id) { if (id.split("?")[0] === root + "/app/cotizador-app.tsx") return { code: code + "\nexport { QuoteDialog as __TestQuoteDialog };", map: null }; } }],
});
after(async () => { await vite.close(); delete globalThis.__quoteHooks; delete globalThis.__quoteApi; delete globalThis.__quoteRealReact; });
const { __TestQuoteDialog: QuoteDialog } = await vite.ssrLoadModule("/app/cotizador-app.tsx");
const tick = () => new Promise(resolve => setImmediate(resolve));
function mount(props) {
  const slots = []; let cursor = 0, dirty = true, tree, pending = [];
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { kind: "state", value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, next => { const value = typeof next === "function" ? next(slots[index].value) : next; if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; } }];
    },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        slots[index] = { kind: "effect", deps, cleanup: previous?.cleanup };
        pending.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  return {
    get tree() { return tree; },
    async flush(nextProps) {
      if (nextProps) { props = nextProps; dirty = true; }
      for (let pass = 0; pass < 20; pass++) {
        if (dirty) { dirty = false; cursor = 0; pending = []; globalThis.__quoteHooks = hooks; tree = QuoteDialog(props); for (const effect of pending) effect(); }
        await tick(); if (!dirty) return tree;
      }
      throw new Error("The dialog did not settle");
    },
    unmount() { for (const slot of slots) if (slot.kind === "effect") slot.cleanup?.(); },
  };
}
function nodes(element) {
  if (Array.isArray(element)) return element.flatMap(nodes);
  if (!element || typeof element !== "object" || !element.props) return [];
  return [element, ...nodes(element.props.children)];
}
function text(element) {
  if (Array.isArray(element)) return element.map(text).join("");
  return element?.props ? text(element.props.children) : typeof element === "string" ? element : "";
}
const find = (tree, predicate) => { const result = nodes(tree).find(predicate); assert.ok(result, "Control not found"); return result; };
const projectField = tree => find(tree, node => node.props.label === "Proyecto");
const selectWith = (tree, label) => find(tree, node => node.type === "select" && text(node.props.children).includes(label));
const catalogId = "0740049e-9aa0-4eee-9469-191d5fac0d70";
const baseData = { economicSettings: { overhead_percent: 10, discount_percent: 0 }, clients: [{ publicId: "client-1", name: "Cliente prueba" }], catalogItems: [{ publicId: catalogId, code: "MAT-1", name: "Cable de prueba", description: "Cobre", unit: "m", unitCost: "1000", unitPrice: "1500", currency: "CLP", type: "Material", supplier: "Proveedor" }], session: { user: { publicId: "user-1" }, permissions: [] } };
const propsFor = (data = baseData, quote = null) => ({ open: true, onOpenChange() {}, data, quote, online: true, onSaved() {}, onQueued() {} });

test("new quote retains client, project and catalog items across background refresh and callback updates", async () => {
  const props = propsFor(); const app = mount(props); await app.flush();
  selectWith(app.tree, "Seleccione un cliente").props.onChange({ target: { value: "client-1" } });
  projectField(app.tree).props.onChange("Tablero de bombas"); await app.flush();
  selectWith(app.tree, "Agregar desde biblioteca").props.onChange({ target: { value: catalogId } }); await app.flush();
  find(app.tree, node => typeof node.props.onClick === "function" && text(node).trim() === "Agregar partida").props.onClick(); await app.flush();
  for (let interval = 0; interval < 3; interval++) {
    await app.flush({ ...props, onOpenChange() {}, online: interval !== 1, data: { ...baseData, clients: [...baseData.clients], catalogItems: [...baseData.catalogItems], economicSettings: { overhead_percent: 99, discount_percent: 50 } } });
    assert.equal(projectField(app.tree).props.value, "Tablero de bombas");
    assert.equal(selectWith(app.tree, "Seleccione un cliente").props.value, "client-1");
    assert.equal(find(app.tree, node => node.props["aria-label"] === "Nombre de partida 1").props.value, "Cable de prueba");
    assert.equal(find(app.tree, node => node.props.label === "Gastos generales (%)").props.value, "10");
  }
  app.unmount();
});

test("editing a draft loads once and retains unsaved changes after refreshed quote/settings objects", async () => {
  let loads = 0; const quote = { publicId: "quote-1", number: "COT-1" };
  globalThis.__quoteApi = async () => { loads++; return { quote: { clientPublicId: "client-1", project: "Proyecto guardado", issueDate: "2026-10-20", currency: "CLP" }, manualItems: [{ name: "Mano de obra", quantity: 1, unit: "gl", unitCost: 100, unitPrice: 200 }], materialGroups: [], commercial: { discountPercent: 0, taxPercent: 19, overheadPercent: 10, contingencyPercent: 5, targetMarginPercent: 25, roundingMultiple: 1000, validityDays: 20, paymentTerms: "50%", deliveryTerms: "Por definir", notes: "" } }; };
  const props = propsFor(baseData, quote), app = mount(props); await app.flush();
  projectField(app.tree).props.onChange("Edición aún sin guardar"); await app.flush();
  await app.flush({ ...props, quote: { ...quote }, data: { ...baseData, economicSettings: { ...baseData.economicSettings, discount_percent: 20 } } });
  assert.equal(loads, 1); assert.equal(projectField(app.tree).props.value, "Edición aún sin guardar");
  app.unmount();
});

test("a fresh opening starts clean with current defaults and stale loads are cancelled on close", async () => {
  const app = mount(propsFor()); await app.flush(); projectField(app.tree).props.onChange("Descartado al cerrar"); await app.flush(); app.unmount();
  const reopened = mount(propsFor({ ...baseData, economicSettings: { overhead_percent: 22, discount_percent: 7 } })); await reopened.flush();
  assert.equal(projectField(reopened.tree).props.value, ""); assert.equal(selectWith(reopened.tree, "Seleccione un cliente").props.value, "");
  assert.equal(find(reopened.tree, node => node.props.label === "Gastos generales (%)").props.value, "22"); reopened.unmount();
  let rejectLoad, closed = 0;
  globalThis.__quoteApi = () => new Promise((_, reject) => { rejectLoad = reject; });
  const loading = mount({ ...propsFor(baseData, { publicId: "pending-quote", number: "COT-2" }), onOpenChange: () => { closed++; } });
  await loading.flush(); loading.unmount(); rejectLoad(new Error("Request ended after close")); await tick();
  assert.equal(closed, 0);
});

test("parent mounts the quote editor only while open and does not key it by pricing defaults", async () => {
  const source = await readFile(new URL("../app/cotizador-app.tsx", import.meta.url), "utf8");
  const dialog = source.slice(source.indexOf("<QuoteDialog"), source.indexOf("<QuoteFlowDialog"));
  assert.match(source, /quoteOpen && can\("quotes.write"\)/);
  assert.doesNotMatch(dialog.slice(0, dialog.indexOf("open={")), /economicSettings/);
  assert.match(dialog, /onOpenChange=\{handleQuoteOpenChange\}/);
});
