import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, "docs/ARCHIVOS_V3_6.json"), "utf8"));
let failures = 0;
for (const file of manifest.files) {
  if (path.isAbsolute(file.path) || file.path.split(/[\\/]/).includes("..")) throw new Error("Ruta inválida en manifiesto.");
  try {
    const bytes = await readFile(path.join(root, file.path));
    if (bytes.length !== file.bytes || createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
      failures++; console.error(`DIFERENTE: ${file.path}`);
    }
  } catch (error) { failures++; console.error(`FALTA/INACCESIBLE: ${file.path} (${error.code || "error"})`); }
}
if (failures) { console.error(`${failures} archivos requieren revisión. Revise si conservó una configuración propia deliberadamente.`); process.exitCode = 1; }
else console.log(`Distribución v${manifest.version} completa: ${manifest.files.length} archivos verificados. No se incluye el propio manifiesto en las huellas.`);
