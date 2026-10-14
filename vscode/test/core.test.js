'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../src/core');

test('real project schema parses and validates', () => {
  const doc = core.parse(fs.readFileSync(path.join(__dirname, '../../Test/Proto.sproto'), 'utf8'), 'sample');
  assert.ok(doc.types.length > 100); assert.ok(doc.protocols.length > 100);
  assert.deepEqual(core.validate(doc, [doc]), []);
});
test('nested scopes, qualified names, inline protocol bodies, forward declarations', () => {
  const doc = core.parse('.Outer { .Inner { next 0 : Inner } a 0 : Inner b 1 : Global }\n.Global { a 0 : Outer.Inner }\nfoo 1 { request Outer response { a 0 : Global } }', 'a');
  assert.deepEqual(core.validate(doc, [doc]), []);
  assert.equal(core.resolve(doc.refs[0], [doc])[0].fullName, 'Outer.Inner');
  assert.equal(core.resolve(doc.refs[3], [doc])[0].fullName, 'Outer.Inner');
});
test('cross file definitions and same file precedence', () => {
  const a = core.parse('.A { field 0 : B }', 'a');
  const b = core.parse('.B {}', 'b');
  assert.equal(core.resolve(a.refs[0], [a, b])[0].uri, 'b');
  const c = core.parse('.B {}', 'c');
  assert.match(core.validate(a, [a, b, c])[0].message, /多个定义/);
  const local = core.parse('.B {} .A { field 0 : B }', 'local');
  assert.equal(core.resolve(local.refs[0], [local, b, c])[0].uri, 'local');
});
test('dictionary keys, empty maps, precision, builtins and nil', () => {
  const doc = core.parse('.KV { key 0 : integer value 1 : string } .A { a 0 : *KV() b 1 : *KV(key) c 2 : integer(3) d 3 : *integer(2) e 4 : binary f 5 : double } p 1 { request nil response nil }');
  assert.deepEqual(core.validate(doc, [doc]), []);
  const bad = core.parse('.KV { k 0 : Missing } .A { a 0 : *KV(missing) b 1 : string(3) c 2 : integer(foo) d 3 : KV(k) e 4 : *integer() f 5 : nil }');
  assert.ok(core.validate(bad, [bad]).length >= 7);
});
test('duplicates and malformed syntax recover without hangs', () => {
  const doc = core.parse('.A {\n a 0 integer\n b 1 : Unknown\n b 1 : string\n}\n.A {}\np 1 { request {} request {} }\nq 1 {}');
  const issues = core.validate(doc, [doc]);
  for (const match of [/需要“:”/, /未定义/, /重复的字段：/, /重复的字段编号/, /重复的类型/, /重复的 request/, /重复的协议编号/])
    assert.ok(issues.some(d => match.test(d.message)), String(match));
  for (const text of ['}', '. {', '.A { x 0 :', '.A { x 0 : Foo. }', 'p 0 { wrong }', '@', '.A { x 0 : *']) assert.ok(core.parse(text).diagnostics.length);
});
test('type, qualified, key, precision and protocol completions; comments suppressed', () => {
  function complete(text) { const doc = core.parse(text, 'a'); return core.completions(doc, text.indexOf('|'), [doc]).map(e => e.label); }
  assert.ok(complete('.A { .Inner {} x 0 : | }').includes('Inner'));
  assert.ok(complete('.A {} .B { x 0 : A| }').includes('A'));
  assert.ok(complete('.A { .Inner {} } .B { x 0 : A.| }').includes('A.Inner'));
  assert.deepEqual(complete('.A { key 0 : integer } .B { x 0 : *A(|) }'), ['key']);
  assert.ok(complete('.A { x 0 : integer(|) }').includes('3'));
  assert.ok(complete('p 0 { request | }').includes('nil'));
  assert.ok(!complete('p 0 { request | }').includes('integer'));
  assert.deepEqual(complete('# comment |'), []);
});
test('UTF-16 offsets and CRLF work with Chinese comments', () => {
  const text = '# 中文😀\r\n.A {}\r\n.B { a 0 : A }';
  const doc = core.parse(text, 'a');
  assert.equal(doc.refs[0].start, text.lastIndexOf('A'));
  assert.equal(core.at(doc, doc.refs[0].start).name, 'A');
  assert.deepEqual(core.validate(doc, [doc]), []);
});
test('fields followed by nested declarations are separate grammar items', () => {
  const doc = core.parse('.A { f 0 : string\n .B {}\n b 1 : B }');
  assert.deepEqual(core.validate(doc, [doc]), []);
  assert.equal(doc.refs[0].name, 'string');
  assert.ok(core.parse('. A {}').diagnostics.some(d => /点号后不能含空白/.test(d.message)));
});
test('highlight distinguishes types, fields, protocol methods and keyword-like field names', () => {
  const text = '# request integer Foo\r\n.Outer { request 0 : integer integer 1 : Outer .Inner {} x 2 : Outer.Inner list 3 : *Outer(request) }\r\nLogin 1 { request { ok 0 : boolean } response nil }';
  const doc = core.parse(text);
  const tokens = core.highlight(doc);
  const token = offset => tokens.find(t => t.start === offset);
  assert.equal(token(text.indexOf('Outer')).type, 'sprotoType');
  assert.equal(token(text.indexOf('request 0')).type, 'sprotoField');
  assert.equal(token(text.indexOf('integer 1')).type, 'sprotoField');
  assert.equal(token(text.indexOf('integer integer')).type, 'sprotoBuiltin');
  assert.equal(token(text.indexOf('Login')).type, 'sprotoProtocol');
  assert.equal(token(text.indexOf('request {')).type, 'keyword');
  assert.equal(token(text.indexOf('ok 0')).type, 'sprotoField');
  assert.equal(token(text.indexOf('request)')).type, 'sprotoField');
  for (const t of tokens) {
    assert.ok(t.type === 'comment' || t.start >= text.indexOf('.Outer'));
    assert.ok(!/[\r\n]/.test(text.slice(t.start, t.end)));
  }
  const qualified = text.indexOf('Outer.Inner');
  assert.equal(token(qualified).type, 'sprotoType');
  assert.equal(token(qualified + 'Outer.'.length).type, 'sprotoType');
  assert.deepEqual(token(text.indexOf('Outer')).modifiers, ['declaration']);
  assert.deepEqual(token(qualified).modifiers, ['reference']);
  assert.deepEqual(token(text.indexOf('request 0')).modifiers, ['declaration']);
  assert.deepEqual(token(text.indexOf('request)')).modifiers, ['reference']);
  assert.deepEqual(token(text.indexOf('Login')).modifiers, ['declaration']);
  const rules = require('../package.json').contributes.configurationDefaults['editor.semanticTokenColorCustomizations'].rules;
  assert.equal(new Set(['sprotoType', 'sprotoField', 'sprotoProtocol'].map(t => rules[t + ':sproto'])).size, 3);
});
test('settings expose separate categories and numeric colors inherit the theme', () => {
  const text = '.A { x 7 : integer(3) a 8 : *A(x) } Call 23 { request A response nil } # 中文';
  const doc = core.parse(text), tokens = core.highlight(doc);
  const token = value => tokens.find(t => t.start === text.indexOf(value));
  for (const [value, modifier] of [['7', 'fieldTag'], ['23', 'protocolTag'], ['3)', 'precision'],
    ['request', 'request'], ['response', 'response'], ['integer', 'integer'], ['nil', 'nil'],
    ['.', 'typeMarker'], ['*', 'array'], [':', 'fieldSeparator'], ['{', 'braces'], ['(', 'parentheses']])
    assert.ok(token(value).modifiers.includes(modifier), value);
  assert.equal(token('#').type, 'comment');
  const manifest = require('../package.json');
  const rules = manifest.contributes.configurationDefaults['editor.semanticTokenColorCustomizations'].rules;
  assert.equal(rules['sprotoField:sproto'], '#FFFFFF');
  assert.equal(rules['sprotoBuiltin:sproto'], '#569CD6');
  assert.ok(!Object.keys(rules).some(key => key.startsWith('number')));
  assert.ok(!manifest.contributes.configurationDefaults['editor.tokenColorCustomizations'].textMateRules.some(r => r.scope.includes('numeric')));
  const declared = new Set(['declaration', ...manifest.contributes.semanticTokenModifiers.map(m => m.id)]);
  for (const t of tokens) {
    assert.ok(core.highlightTypes.includes(t.type));
    for (const m of t.modifiers) assert.ok(declared.has(m) && core.highlightModifiers.includes(m), m);
  }
  for (const type of core.builtins) {
    const m = core.parse(`.A { x 0 : ${type} }`);
    assert.ok(core.highlight(m).some(t => t.type === 'sprotoBuiltin' && t.modifiers.includes(type)), type);
  }
});
