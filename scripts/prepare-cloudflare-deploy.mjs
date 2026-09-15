import fs from "node:fs";

const generatedPath = "dist/server/wrangler.json";
const productionPath = "wrangler.production.jsonc";

if (!fs.existsSync(generatedPath)) {
  throw new Error(`No existe ${generatedPath}. Ejecute primero npm run build.`);
}

const generated = JSON.parse(fs.readFileSync(generatedPath, "utf8"));
const production = JSON.parse(fs.readFileSync(productionPath, "utf8"));

generated.name = production.name;
generated.compatibility_date = production.compatibility_date;
generated.compatibility_flags = production.compatibility_flags;
generated.d1_databases = production.d1_databases;
generated.r2_buckets = production.r2_buckets;

fs.writeFileSync(generatedPath, JSON.stringify(generated, null, 2) + "`n", "utf8");

console.log("Configuración generada preparada correctamente:");
console.log(`Worker: ${generated.name}`);
console.log(`D1: ${generated.d1_databases[0].database_name}`);
console.log(`R2: ${generated.r2_buckets[0].bucket_name}`);
