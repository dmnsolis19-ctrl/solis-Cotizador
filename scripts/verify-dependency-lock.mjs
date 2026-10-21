import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function dependencyLockIssues(pkg, lock) {
  const issues = [];
  const root = lock.packages?.[""];
  if (!root || lock.lockfileVersion < 2) return ["El lockfile debe incluir packages y su paquete raíz."];
  for (const field of ["name", "version"]) {
    if (pkg[field] !== lock[field] || pkg[field] !== root[field]) issues.push(`${field}: package.json y package-lock.json no coinciden.`);
  }
  for (const section of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const declared = pkg[section] || {}, recorded = root[section] || {};
    for (const name of new Set([...Object.keys(declared), ...Object.keys(recorded)])) {
      if (declared[name] !== recorded[name]) issues.push(`${section}.${name}: la declaración raíz del lockfile no coincide.`);
      const spec = declared[name];
      // npm ci performs the full range/peer resolution. Check exact pins here
      // without installing anything or depending on a transitive semver module.
      if (section !== "peerDependencies" && typeof spec === "string" && /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(spec)) {
        const installed = lock.packages[`node_modules/${name}`]?.version;
        if (installed !== spec) issues.push(`${name}: se exige ${spec}, pero el lockfile registra ${installed || "ninguna versión"}.`);
      }
    }
  }
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (!location || !entry.resolved?.startsWith("https://registry.npmjs.org/")) continue;
    const name = (entry.name || location.split("node_modules/").at(-1)).split("/").at(-1);
    const actual = decodeURIComponent(new URL(entry.resolved).pathname.split("/").at(-1));
    const expected = `${name}-${entry.version}.tgz`;
    if (actual !== expected) issues.push(`${location}: versión ${entry.version} incompatible con la descarga ${actual}.`);
    if (!entry.integrity) issues.push(`${location}: falta la integridad de la descarga.`);
  }
  return issues;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL("..", import.meta.url));
  const [pkg, lock] = await Promise.all(["package.json", "package-lock.json"].map(async name => JSON.parse(await readFile(path.join(root, name), "utf8"))));
  const issues = dependencyLockIssues(pkg, lock);
  if (issues.length) {
    console.error("Dependencias incoherentes:\n" + issues.map(issue => `- ${issue}`).join("\n"));
    process.exitCode = 1;
  } else console.log(`Lockfile coherente: ${Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length} dependencias directas y ${Object.keys(lock.packages).length - 1} entradas bloqueadas verificadas. La instalación completa se valida con npm ci.`);
}
