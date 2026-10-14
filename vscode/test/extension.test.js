'use strict';
// Exercise the adapter with an API double. Real-host packaging is checked separately.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../src/core');

test('providers use workspace files and dirty editors; lifecycle refreshes diagnostics', async () => {
  const handlers = {}, providers = {}, issues = new Map(), scheduled = new Set();
  const event = name => fn => { handlers[name] = fn; return { dispose() {} }; };
  const uri = value => ({ scheme: 'file', toString: () => value });
  const files = new Map([['file:///workspace/b.sproto', '.B { id 0 : integer }'], ['file:///other/b.sproto', '.B {}']]);
  const makeDoc = (name, text) => ({ uri: uri(name), languageId: 'sproto', text, getText() { return this.text; },
    positionAt: offset => offset, offsetAt: offset => offset });
  const source = makeDoc('file:///workspace/a.sproto', '.A { field 0 : B }');
  const folder = value => value.toString().startsWith('file:///workspace/') ? { uri: uri('file:///workspace') } : { uri: uri('file:///other') };
  class Range { constructor(start, end) { this.start = start; this.end = end; } }
  class Location { constructor(uri, range) { this.uri = uri; this.range = range; } }
  class Diagnostic { constructor(range, message, severity) { Object.assign(this, { range, message, severity }); } }
  class MarkdownString { constructor() { this.value = ''; } appendText(text) { this.value += text; } appendCodeblock(text) { this.value += text; } }
  class Hover { constructor(contents, range) { Object.assign(this, { contents, range }); } }
  class CompletionItem { constructor(label, kind) { Object.assign(this, { label, kind }); } }
  class SnippetString { constructor(value) { this.value = value; } }
  class DocumentSymbol { constructor(name) { this.name = name; } }
  class SemanticTokensLegend { constructor(types, modifiers) { this.types = types; this.modifiers = modifiers; } }
  class SemanticTokensBuilder {
    constructor() { this.tokens = []; }
    push(range, type, modifiers) { this.tokens.push({ range, type, modifiers }); }
    build() { return this.tokens; }
  }
  const vscode = {
    Range, Location, Diagnostic, MarkdownString, Hover, CompletionItem, SnippetString, DocumentSymbol, SemanticTokensLegend, SemanticTokensBuilder,
    Uri: { parse: uri }, DiagnosticSeverity: { Error: 0 }, CompletionItemKind: {}, SymbolKind: {},
    window: { visibleTextEditors: [], onDidChangeVisibleTextEditors: event('visible'), createOutputChannel: () => ({ dispose() {}, appendLine() {} }) },
    commands: { registerCommand: () => ({ dispose() {} }) },
    workspace: {
      textDocuments: [source], getWorkspaceFolder: folder,
      findFiles: async () => [...files.keys()].map(uri),
      fs: { readFile: async u => Buffer.from(files.get(u.toString())) },
      openTextDocument: async u => vscode.workspace.textDocuments.find(d => d.uri.toString() === u.toString()) || makeDoc(u.toString(), files.get(u.toString())),
      createFileSystemWatcher: () => ({ dispose() {}, onDidCreate: event('create'), onDidChange: event('diskChange'), onDidDelete: event('delete') }),
      onDidOpenTextDocument: event('open'), onDidChangeTextDocument: event('edit'), onDidCloseTextDocument: event('close'), onDidChangeWorkspaceFolders: event('folders'), onDidChangeConfiguration: event('config')
    },
    languages: { createDiagnosticCollection: () => ({ dispose() {}, set: (u, v) => issues.set(u.toString(), v), delete: u => issues.delete(u.toString()) }) }
  };
  for (const name of ['Definition', 'CompletionItem', 'Hover', 'DocumentSymbol', 'DocumentSemanticTokens'])
    vscode.languages[`register${name}Provider`] = (_selector, provider) => { providers[name] = provider; return { dispose() {} }; };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/extension.js'), 'utf8'), {
    require: name => name === 'vscode' ? vscode : name === './colors' ? require('../src/colors') : core, module, Buffer,
    setTimeout: fn => { scheduled.add(fn); return fn; }, clearTimeout: fn => scheduled.delete(fn)
  });
  module.exports.activate({ subscriptions: [] });
  await new Promise(resolve => setImmediate(resolve));
  function flush() { const callbacks = [...scheduled]; scheduled.clear(); callbacks.forEach(fn => fn()); }
  flush();
  assert.equal(issues.get(source.uri.toString()).length, 0);
  const typeOffset = source.text.lastIndexOf('B');
  const definition = await providers.Definition.provideDefinition(source, typeOffset);
  assert.equal(definition.length, 1); assert.equal(definition[0].uri.toString(), 'file:///workspace/b.sproto');
  assert.equal(definition[0].range.start, 1);
  assert.match(providers.Hover.provideHover(source, typeOffset).contents.value, /id 0 : integer/);
  assert.ok(providers.CompletionItem.provideCompletionItems(source, typeOffset + 1).some(c => c.label === 'B'));
  assert.equal(providers.DocumentSymbol.provideDocumentSymbols(source)[0].name, 'A');
  const colors = providers.DocumentSemanticTokens.provideDocumentSemanticTokens(source);
  assert.equal(colors.find(t => t.range.start === source.text.indexOf('field')).type, 'sprotoField');
  assert.equal(colors.find(t => t.range.start === typeOffset).type, 'sprotoType');
  assert.deepEqual(Array.from(colors.find(t => t.range.start === typeOffset).modifiers), ['reference']);
  assert.deepEqual(Array.from(colors.find(t => t.range.start === source.text.indexOf('field')).modifiers), ['declaration']);
  const dirty = makeDoc('file:///workspace/b.sproto', '.Renamed {}');
  vscode.workspace.textDocuments.push(dirty); handlers.edit({ document: dirty }); flush();
  assert.ok(issues.get(source.uri.toString()).some(d => /未定义/.test(d.message)));
  assert.equal((await providers.Definition.provideDefinition(source, typeOffset)).length, 0);
  dirty.text = '.B {}'; handlers.edit({ document: dirty }); flush();
  assert.equal(issues.get(source.uri.toString()).length, 0);
  vscode.workspace.textDocuments.pop(); await handlers.close(dirty); flush();
  assert.match(providers.Hover.provideHover(source, typeOffset).contents.value, /id 0 : integer/);
  files.delete('file:///workspace/b.sproto'); handlers.delete(uri('file:///workspace/b.sproto')); flush();
  assert.ok(issues.get(source.uri.toString()).some(d => /未定义/.test(d.message)));
});
