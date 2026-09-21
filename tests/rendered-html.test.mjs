import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("declares SOLIS metadata and a valid installable manifest", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));

  assert.match(layout, /title:\s*["']SOLIS Cotizador PWA["']/);
  assert.match(layout, /manifest:\s*["']\/manifest\.webmanifest["']/);
  assert.doesNotMatch(layout, /Starter Project/);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.icons[0].purpose, "any maskable");
  assert.equal(manifest.icons[0].src, "/solis-logo.png");
  const [app, login, worker] = await Promise.all([
    readFile(new URL("../app/cotizador-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);
  assert.match(app, /src="\/solis-logo\.png"/);
  assert.match(login, /src="\/solis-logo\.png"/);
  assert.match(worker, /solis-logo\.png/);
});
