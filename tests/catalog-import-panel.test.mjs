import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as React from 'react';
import { createServer } from 'vite';
const root = fileURLToPath(new URL('..', import.meta.url));
const originalFetch = globalThis.fetch;
globalThis.__importReact = React;
const vite = await createServer({ appType: 'custom', configFile: false, root, server: { middlewareMode: true }, resolve: { alias: [{ find: /^react$/, replacement: 'virtual:import-hooks' }, { find: '@/lib/tabular-file', replacement: 'virtual:import-file' }, { find: '@', replacement: root }] }, plugins: [{ name: 'import-ui-test', resolveId(id) { if (id.startsWith('virtual:import-')) return '\0' + id; }, load(id) {
  if (id === '\0virtual:import-hooks') return Object.keys(React).filter(key => /^[A-Za-z_$][\w$]*$/.test(key) && !['default', 'useState', 'useRef'].includes(key)).map(key => `export const ${key}=globalThis.__importReact[${JSON.stringify(key)}];`).join(' ') + ' export const useState=(...a)=>globalThis.__importHooks.useState(...a); export const useRef=(...a)=>globalThis.__importHooks.useRef(...a);';
  if (id === '\0virtual:import-file') return 'export const readImportFile=(...args)=>globalThis.__readImportFile(...args); export const importTemplateXlsx=()=>new Uint8Array();';
} }] });
after(async () => { await vite.close(); globalThis.fetch = originalFetch; delete globalThis.__importReact; delete globalThis.__importHooks; delete globalThis.__readImportFile; });
const { CatalogImportPanel } = await vite.ssrLoadModule('/components/catalog-import-panel.tsx');
const { IMPORT_COLUMNS, importPreviewCsv, parseCsv } = await vite.ssrLoadModule('/lib/catalog-import.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
const table = code => [IMPORT_COLUMNS, [code, 'Material', 'Electricidad', 'Cable', '', 'm', '1000', '1300', 'CLP', 'neto', '19', '', '', '2026-10-22']];
function mount(props = {}) {
  const slots = []; let cursor = 0, dirty = true, tree;
  const hooks = { useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; dirty = true; }]; }, useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { current: initial }; return slots[i]; } };
  return { get tree() { return tree; }, async flush(next) { props = { ...props, ...next }; if (next) dirty = true; for (let i = 0; i < 20; i++) { if (dirty) { dirty = false; cursor = 0; globalThis.__importHooks = hooks; tree = CatalogImportPanel({ online: true, onImported() {}, ...props }); } await tick(); if (!dirty) return tree; } throw Error('Component did not settle'); } };
}
function nodes(el) { if (Array.isArray(el)) return el.flatMap(nodes); if (!el?.props) return []; return [el, ...nodes(el.props.children)]; }
function text(el) { return Array.isArray(el) ? el.map(text).join('') : el?.props ? text(el.props.children) : typeof el === 'string' || typeof el === 'number' ? String(el) : ''; }
function find(tree, predicate) { const node = nodes(tree).find(predicate); assert.ok(node, 'Control not found'); return node; }
const button = (tree, label) => find(tree, node => typeof node.props.onClick === 'function' && text(node).trim().startsWith(label));
const choose = (app, file) => find(app.tree, n => n.type === 'input' && n.props.type === 'file').props.onChange({ target: { files: file ? [file] : [], value: file?.name || '' } });
const mode = app => find(app.tree, n => n.type === 'select').props.onChange({ target: { value: 'add' } });
const preview = rows => rows.map((r, i) => ({ row: i + 2, code: r.codigo, action: 'add', errors: [], expectedState: 'missing', input: { nombre: r.nombre, moneda: 'CLP' }, netCost: 1000, netPrice: 1300 }));

test('a slower file read cannot replace the last chosen file, and an invalid reread clears the prior rows', async () => {
  let finishA; globalThis.__readImportFile = file => file.name === 'A.csv' ? new Promise(resolve => { finishA = resolve; }) : Promise.resolve(table('B'));
  const app = mount(); await app.flush(); choose(app, { name: 'A.csv' }); await app.flush();
  assert.equal(find(app.tree, n => n.type === 'select').props.disabled, true);
  choose(app, { name: 'B.csv' }); await app.flush(); finishA(table('A')); await app.flush();
  assert.ok(text(app.tree).includes('B.csv')); assert.ok(!text(app.tree).includes('A.csv'));
  globalThis.__readImportFile = async () => { throw Error('Archivo dañado'); };
  choose(app, { name: 'B.csv' }); await app.flush();
  assert.ok(!text(app.tree).includes('Archivo listo')); assert.equal(find(app.tree, n => n.props.role === 'alert').props.children, 'Archivo dañado');
  assert.equal(button(app.tree, 'Validar y').props.disabled, true);
});

test('import requires preview then confirmation, ignores duplicate clicks and reports the actual result', async () => {
  let imported = 0; const calls = []; globalThis.__readImportFile = async () => table('MAT-1');
  globalThis.fetch = async (_url, options) => { const input = JSON.parse(options.body); calls.push(input); return Response.json(input.action === 'preview' ? { preview: preview(input.rows) } : { summary: { added: 1, updated: 0, skipped: 0 } }); };
  const app = mount({ onImported() { imported++; } }); await app.flush(); choose(app, { name: 'Precios.csv' }); await app.flush(); mode(app); await app.flush();
  button(app.tree, 'Validar y').props.onClick(); await app.flush(); assert.equal(calls.length, 1); assert.equal(imported, 0);
  assert.ok(nodes(app.tree).some(n => n.props['aria-label'] === 'Filas de la importación'));
  const confirm = button(app.tree, 'Confirmar '); confirm.props.onClick(); confirm.props.onClick(); await app.flush();
  assert.equal(calls.length, 2); assert.equal(calls[1].action, 'commit'); assert.deepEqual(calls[1].expectedStates, ['missing']); assert.equal(imported, 1);
  assert.ok(text(app.tree).includes('Importación terminada: 1 agregados')); assert.ok(!text(app.tree).includes('Archivo listo'));
});

test('invalid rows block every write and can be filtered; a failed revalidation removes the previous confirmation', async () => {
  globalThis.__readImportFile = async () => table('MAT-1'); let fail = false;
  globalThis.fetch = async (_url, options) => { const input = JSON.parse(options.body); assert.equal(input.action, 'preview'); return fail ? Response.json({ error: 'La sesión venció' }, { status: 401 }) : Response.json({ preview: [...preview(input.rows), { row: 3, code: '=BAD', action: 'error', errors: ['costo: inválido'], expectedState: 'missing' }] }); };
  const app = mount(); await app.flush(); choose(app, { name: 'Precios.csv' }); await app.flush(); mode(app); await app.flush(); button(app.tree, 'Validar y').props.onClick(); await app.flush();
  assert.equal(button(app.tree, 'Confirmar ').props.disabled, true); button(app.tree, 'Solo inválidas').props.onClick(); await app.flush();
  const cards = find(app.tree, n => n.props['aria-label'] === 'Filas de la importación'); assert.ok(text(cards).includes('=BAD')); assert.ok(!text(cards).includes('MAT-1'));
  fail = true; button(app.tree, 'Validar y').props.onClick(); await app.flush();
  assert.ok(!nodes(app.tree).some(n => typeof n.props.onClick === 'function' && text(n).startsWith('Confirmar '))); assert.ok(text(app.tree).includes('La sesión venció'));
});

test('validation report preserves exact row numbers, decimals and escaped spreadsheet content', () => {
  const csv = importPreviewCsv([{ row: 8, code: '=2+2', action: 'error', errors: ['=HYPERLINK("x")\nRevise; precio'], expectedState: 'missing' }, { row: 12, code: 'OK', action: 'update', errors: [], expectedState: 'old', netCost: 0, netPrice: 1234.56, input: { nombre: '@material', moneda: 'CLP' } }]);
  const rows = parseCsv(csv); assert.equal(rows.length, 3); assert.equal(rows[1][0], '8'); assert.equal(rows[1][1], "'=2+2"); assert.equal(rows[1][7], '\'=HYPERLINK("x")\nRevise; precio');
  assert.equal(rows[2][3], "'@material"); assert.equal(rows[2][4], '0'); assert.equal(rows[2][5], '1234.56');
});

test('install and build bootstrap through Bash even when uploaded scripts have no executable bit', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'solis-bash-'));
  try {
    await writeFile(path.join(dir, 'sites-env.sh'), '#!/bin/bash\nshift\nexec "$@"\n'); await chmod(path.join(dir, 'sites-env.sh'), 0o644);
    for (const filename of ['install-ci.sh', 'build-verified.sh']) {
      const source = await readFile(path.join(root, 'scripts', filename), 'utf8');
      const boundary = source.indexOf('\nnode "${SITES_PROJECT_ROOT}/scripts/verify-dependency-lock.mjs"'); assert.ok(boundary > 0);
      await writeFile(path.join(dir, filename), source.slice(0, boundary) + '\nprintf "bootstrap-ok"\n'); await chmod(path.join(dir, filename), 0o644);
      const env = { ...process.env, SITES_ENV_READY: '1' }; delete env.SITES_ENV_READY;
      // A stub sets the environment marker just as the real environment wrapper does.
      await writeFile(path.join(dir, 'sites-env.sh'), '#!/bin/bash\nexport SITES_ENV_READY=1\nshift\nexec "$@"\n');
      const result = spawnSync('bash', [path.join(dir, filename)], { env, encoding: 'utf8', timeout: 5000 });
      assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, 'bootstrap-ok');
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
