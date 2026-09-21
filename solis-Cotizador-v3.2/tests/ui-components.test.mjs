import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

test("calculates SOLIS cost, discount, tax and margin rules", async () => {
  const { calculateQuote } = await vite.ssrLoadModule("/lib/pricing.ts");
  const result = calculateQuote(
    [{ name: "PLC", quantity: 1, unit: "un", unitCost: 780000, unitPrice: 1080000 }],
    { overheadPercent: 10, contingencyPercent: 5, targetMarginPercent: 25, discountPercent: 3, taxPercent: 19, roundingMultiple: 1000 },
  );

  assert.equal(result.directCost, 780000);
  assert.equal(result.internalCost, 897000);
  assert.equal(result.netSubtotal, 1047600);
  assert.equal(result.tax, 199044);
  assert.equal(result.total, 1246644);
  assert.equal(result.estimatedProfit, 150600);
  assert.equal(result.targetNetSale, 1196000);
});

test("enforces controlled revision and approval workflow", async () => {
  const workflow = await vite.ssrLoadModule("/lib/workflow.ts");
  const draft = { locked: false, status: "Borrador", revision: 0, number: "SIS-COT-2026-001" };
  const sent = { ...draft, locked: true, status: "Enviada" };
  const approved = { ...sent, status: "Aprobada" };

  assert.equal(workflow.canFreeze(draft), true);
  assert.equal(workflow.canApprove(draft), false);
  assert.equal(workflow.canCreateRevision(sent), true);
  assert.equal(workflow.canCreateWorkOrder(sent), false);
  assert.equal(workflow.canCreateWorkOrder(approved), true);
  assert.equal(workflow.revisionNumber("SIS-COT-2026-001-R01", 2), "SIS-COT-2026-001-R02");
});
