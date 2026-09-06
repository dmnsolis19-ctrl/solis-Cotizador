import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { createServer } from "vite";

const root = new URL("..", import.meta.url).pathname;
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });

test("hashes passwords with a unique salt and verifies in constant-time style", async () => {
  const { hashPassword, newSalt, secureEqual } = await vite.ssrLoadModule("/lib/password.ts");
  const firstSalt = newSalt();
  const secondSalt = newSalt();
  assert.notEqual(firstSalt, secondSalt);
  const first = await hashPassword("A-long-test-password", firstSalt, 1000);
  const repeated = await hashPassword("A-long-test-password", firstSalt, 1000);
  const second = await hashPassword("A-long-test-password", secondSalt, 1000);
  assert.equal(secureEqual(first, repeated), true);
  assert.equal(secureEqual(first, second), false);
});

test("uses secure server sessions and protects login attempts", async () => {
  const route = await readFile(new URL("../app/api/auth/route.ts", import.meta.url), "utf8");
  assert.match(route, /httpOnly:\s*true/);
  assert.match(route, /sameSite:\s*"strict"/);
  assert.match(route, /secure:\s*true/);
  assert.match(route, /MAX_FAILURES\s*=\s*5/);
  assert.match(route, /BLOCK_MINUTES\s*=\s*15/);
  assert.doesNotMatch(route, /passwordHash:\s*input\.password/);
});
