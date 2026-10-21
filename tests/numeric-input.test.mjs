import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import * as React from 'react';
const root = fileURLToPath(new URL('..', import.meta.url));
globalThis.__numberReact = React;
const vite = await createServer({ appType: 'custom', configFile: false, root, server: { middlewareMode: true }, resolve: { alias: [{ find: /^react$/, replacement: 'virtual:number-hooks' }, { find: '@', replacement: root }] }, plugins: [{ name: 'number-input-test', resolveId(id) { if (id === 'virtual:number-hooks') return '\0' + id; }, load(id) { if (id === '\0virtual:number-hooks') return Object.keys(React).filter(key => /^[A-Za-z_$][\w$]*$/.test(key) && !['default', 'useState', 'useEffect'].includes(key)).map(key => `export const ${key}=globalThis.__numberReact[${JSON.stringify(key)}];`).join(' ') + ' export const useState=(...a)=>globalThis.__numberHooks.useState(...a); export const useEffect=(...a)=>globalThis.__numberHooks.useEffect(...a);'; } }] });
after(async () => { await vite.close(); delete globalThis.__numberReact; delete globalThis.__numberHooks; });
const { Input } = await vite.ssrLoadModule('/components/ui/input.tsx');
function mount(initial, convert = Number, extra = {}) {
  let props = { type: 'number', value: initial, ...extra }, cursor = 0, tree, effects = [], dirty = true;
  const slots = [];
  const hooks = {
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: initial }; return [slots[i].value, value => { if (!Object.is(slots[i].value, value)) { slots[i].value = value; dirty = true; } }]; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((d, j) => !Object.is(d, slots[i].deps[j]))) { slots[i] = { deps }; effects.push(fn); } },
  };
  const api = {
    get field() { return tree.props; },
    flush(next) { if (next) { props = { ...props, ...next }; dirty = true; } for (let i = 0; dirty && i < 15; i++) { dirty = false; cursor = 0; effects = []; globalThis.__numberHooks = hooks; const element = Input(props); tree = typeof element.type === 'function' ? element.type(element.props) : element; effects.forEach(fn => fn()); } assert.ok(!dirty); },
    change(text) { const input = { value: text }; tree.props.onChange({ target: input, currentTarget: input }); api.flush(); return input.value; },
  };
  if (!props.onChange) props.onChange = event => { props = { ...props, value: convert(event.target.value) }; dirty = true; };
  api.flush(); return api;
}
test('numeric state allows deleting to empty and typing a replacement across parent refreshes', () => {
  const app = mount(0);
  app.change(''); assert.equal(app.field.value, '');
  app.flush({ value: 0 }); assert.equal(app.field.value, '');
  app.change('2500'); assert.equal(app.field.value, '2500');
  app.change(''); assert.equal(app.field.value, '');
  app.field.onBlur({}); app.flush(); assert.equal(app.field.value, 0);
});
test('zero is selected on focus/click and leading zero digits do not change the entered amount', () => {
  const app = mount(0); let selected = 0;
  const event = { currentTarget: { value: '0', select() { selected++; } }, defaultPrevented: false };
  app.field.onFocus(event); app.field.onClick(event); assert.equal(selected, 2);
  assert.equal(app.change('02500'), '2500'); assert.equal(app.field.value, '2500');
  app.change('0.05'); assert.equal(app.field.value, '0.05');
  app.change('-0.5'); assert.equal(app.field.value, '-0.5');
  let writes = 0;
  const partial = { get value() { return '' }, set value(_value) { writes++; } };
  app.field.onChange({ target: partial, currentTarget: partial }); app.flush();
  assert.equal(writes, 0, 'Do not programmatically erase a native partial decimal or minus sign');
});
test('decimal editing survives numeric conversion and external value changes replace the draft', () => {
  const app = mount(1, Number, { min: 0, max: 100, step: '0.01', required: true, name: 'precio' });
  app.change('1.20'); assert.equal(app.field.value, '1.20');
  app.flush({ value: 2.5 }); assert.equal(app.field.value, 2.5);
  app.flush({ value: 1.2 }); assert.equal(app.field.value, 1.2);
  assert.equal(app.field.type, 'number'); assert.equal(app.field.min, 0); assert.equal(app.field.max, 100); assert.equal(app.field.step, '0.01'); assert.equal(app.field.required, true); assert.equal(app.field.name, 'precio'); assert.equal(app.field.inputMode, 'decimal');
});
test('string and uncontrolled inputs retain their contracts; refs, callbacks and read-only fields are preserved', () => {
  const app = mount('0', value => value); app.change(''); app.field.onBlur({}); app.flush(); assert.equal(app.field.value, '');
  let focus = 0, selected = 0; const ref = { current: null };
  const uncontrolled = mount(undefined, Number, { defaultValue: 0, ref, readOnly: true, onChange() {}, onFocus() { focus++; } });
  uncontrolled.field.onFocus({ currentTarget: { value: '0', select() { selected++; } } });
  assert.equal(uncontrolled.field.defaultValue, 0); assert.equal(uncontrolled.field.value, undefined); assert.equal(uncontrolled.field.ref, ref); assert.equal(focus, 1); assert.equal(selected, 0);
  assert.equal(Input({ type: 'text', value: '0123' }).props.value, '0123');
});
