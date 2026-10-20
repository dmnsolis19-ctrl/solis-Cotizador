import { readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = "dist/client";
const assets = ["/manifest.webmanifest", "/solis-logo.png"];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else if (entry.name !== "sw.js" && /\.(?:js|css|woff2?)$/.test(entry.name)) assets.push("/" + relative(root, path).replaceAll("\\", "/"));
  }
}
// Vinext releases use different asset directories. Discover the actual output
// instead of tying offline startup to a particular compiler version.
await visit(root);
await writeFile(join(root, "offline-assets.json"), JSON.stringify({ assets: [...new Set(assets)].sort() }) + "\n");
console.log(`Offline: ${assets.length} recursos estáticos preparados.`);
