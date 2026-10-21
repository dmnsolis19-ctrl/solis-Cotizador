import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dependencyLockIssues } from "../scripts/verify-dependency-lock.mjs";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));

test("the distributed package and lockfile agree on root declarations, exact pins and tarballs", () => {
  assert.deepEqual(dependencyLockIssues(pkg, lock), []);
});

test("the tailwind-merge metadata error that blocked Cloudflare is rejected", () => {
  const broken = structuredClone(lock);
  broken.packages["node_modules/tailwind-merge"].version = "3.6.1";
  const issues = dependencyLockIssues(pkg, broken);
  assert.ok(issues.some(issue => issue.includes("se exige 3.6.0") && issue.includes("3.6.1")));
  assert.ok(issues.some(issue => issue.includes("descarga tailwind-merge-3.6.0.tgz")));
});

test("changed declarations and a missing locked dependency cannot pass by keeping stale root metadata", () => {
  const changed = structuredClone(pkg), missing = structuredClone(lock);
  changed.dependencies["tailwind-merge"] = "3.6.1";
  delete missing.packages["node_modules/tailwind-merge"];
  const issues = dependencyLockIssues(changed, missing);
  assert.ok(issues.some(issue => issue.includes("declaración raíz")));
  assert.ok(issues.some(issue => issue.includes("ninguna versión")));
});

test("aligned root declarations still reject the wrong tarball version or missing integrity", () => {
  const broken = structuredClone(lock);
  const entry = broken.packages["node_modules/tailwind-merge"];
  entry.resolved = entry.resolved.replace("3.6.0.tgz", "3.6.1.tgz");
  delete entry.integrity;
  const issues = dependencyLockIssues(pkg, broken);
  assert.ok(issues.some(issue => issue.includes("incompatible con la descarga")));
  assert.ok(issues.some(issue => issue.includes("falta la integridad")));
});
