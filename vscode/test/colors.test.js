'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const colors = require('../src/colors');
const core = require('../src/core');
const vm = require('node:vm');

test('GUI settings schema covers all categories and inherits native defaults', () => {
  const manifest = require('../package.json');
  const release = require('../../plugin-release.json');
  assert.equal(manifest.version, release.version);
  assert.equal(manifest.author, release.author);
  assert.equal(manifest.publisher, release.author);
  assert.ok(manifest.repository.url.startsWith('https://github.com/'));
  const readme = require('node:fs').readFileSync(require('node:path').join(__dirname, '../README.md'), 'utf8');
  const image = readme.match(/<img\s+src="([^"]+)"/);
  assert.ok(image && image[1].startsWith('https://raw.githubusercontent.com/'));
  const properties = manifest.contributes.configuration.properties;
  assert.equal(manifest.contributes.configuration.title, 'Sproto');
  for (const c of colors.categories) {
    assert.equal(properties['sproto.colors.' + c.key].default, '');
    assert.ok(new RegExp(properties['sproto.colors.' + c.key].pattern).test('#112233'));
  }
  assert.ok(colors.validColor('')); assert.ok(colors.validColor('#112233AA'));
  for (const value of ['red', '#123', '<script>', null, { color: '#123456' }]) assert.ok(!colors.validColor(value));
  const m = core.parse('.A { x 7 : integer(3) a 8 : *A(x) } Call 23 { request A response nil } # comment');
  for (const token of core.highlight(m)) if (token.type !== 'variable' && !token.modifiers.includes('unknown')) assert.ok(colors.categoryFor(token), JSON.stringify(token));
  const page = colors.html('test:', 'nonce');
  new vm.Script(page.match(/<script nonce="nonce">([\s\S]*?)<\/script>/)[1]);
});

test('GUI saves scoped overrides, rejects invalid payloads, restores inheritance and refreshes editors', async () => {
  const callbacks = {}, commands = {}, store = new Map(), updates = [], messages = [], applied = [];
  const event = key => fn => { (callbacks[key] ||= []).push(fn); return { dispose() {} }; };
  const resource = { toString: () => 'file:///workspace/a.sproto' };
  const doc = { uri: resource, languageId: 'sproto', getText: () => '.A { x 0 : A }', positionAt: n => n };
  const editor = { document: doc, setDecorations: (style, ranges) => applied.push({ style, ranges }) };
  const panel = { webview: { cspSource: 'test:', onDidReceiveMessage: event('message'),
    postMessage: async m => { messages.push(m); } }, onDidDispose: event('dispose'), dispose() {} };
  const config = {
    inspect: key => store.get(key) || {},
    get: key => { const s = store.get(key) || {}; return s.workspaceFolderValue ?? s.workspaceValue ?? s.globalValue ?? ''; },
    update: async (key, value, target) => {
      updates.push({ key, value, target });
      const s = store.get(key) || {}; s[target] = value; store.set(key, s);
      for (const fn of callbacks.config || []) fn({ affectsConfiguration: () => true });
    }
  };
  const vscode = {
    Range: class { constructor(start, end) { this.start = start; this.end = end; } },
    ConfigurationTarget: { Global: 'globalValue', Workspace: 'workspaceValue', WorkspaceFolder: 'workspaceFolderValue' },
    DecorationRangeBehavior: { ClosedClosed: 1 }, ViewColumn: { Active: 1 },
    commands: { registerCommand: (key, fn) => { commands[key] = fn; return { dispose() {} }; }, executeCommand() {} },
    window: { activeTextEditor: editor, visibleTextEditors: [editor], onDidChangeVisibleTextEditors: event('visible'),
      createWebviewPanel: () => panel, createTextEditorDecorationType: style => ({ ...style, dispose() { this.disposed = true; } }) },
    workspace: { workspaceFolders: [{ uri: resource }], getWorkspaceFolder: () => ({ uri: resource }), getConfiguration: () => config,
      onDidOpenTextDocument: event('open'), onDidCloseTextDocument: event('close'),
      onDidChangeTextDocument: event('edit'), onDidChangeConfiguration: event('config') }
  };
  let executed;
  vscode.commands.executeCommand = (...args) => { executed = args; };
  const context = { subscriptions: [], extension: { packageJSON: require('../package.json') } };
  colors.register(vscode, context, core, d => core.parse(d.getText()));
  commands['sproto.openSettings']();
  assert.deepEqual(executed, ['workbench.action.openSettings', '@ext:Yexiao.sproto-language']);
  commands['sproto.configureColors']();
  const send = message => callbacks.message[0](message);
  await send({ type: 'load', scope: 'user' });
  assert.equal(messages.at(-1).rows.length, colors.categories.length);
  assert.match(panel.webview.html, /type='color'/); assert.match(panel.webview.html, /Content-Security-Policy/);
  await send({ type: 'save', scope: 'user', values: { typeDeclaration: '#112233', fieldDeclaration: '#FFFFFF' } });
  assert.equal(updates[0].target, 'globalValue');
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.ok(applied.some(a => a.style.color === '#112233' && a.ranges.some(r => r.start === 1)));
  assert.ok(!applied.some(a => a.style.color === '#112233' && a.ranges.some(r => r.start === doc.getText().lastIndexOf('A'))));
  await send({ type: 'save', scope: 'workspace', values: { typeReference: '#445566AA' } });
  assert.equal(updates.at(-1).target, 'workspaceValue');
  await send({ type: 'save', scope: 'folder', values: { fieldTag: '#778899' } });
  assert.equal(updates.at(-1).target, 'workspaceFolderValue');
  const count = updates.length;
  await send({ type: 'save', scope: 'user', values: { typeDeclaration: 'red' } });
  assert.equal(updates.length, count); assert.equal(messages.at(-1).type, 'error');
  await send({ type: 'save', scope: 'user', values: { arbitraryKey: '#112233' } });
  assert.equal(updates.length, count);
  await send({ type: 'save', scope: 'user', values: { typeDeclaration: '' } });
  assert.equal(updates.at(-1).value, undefined);
  await send({ type: 'load', scope: 'user' });
  assert.equal(messages.at(-1).rows.find(r => r.key === 'typeDeclaration').color, '');
  store.set('colors.typeReference', { globalValue: '#123456', workspaceValue: '' });
  await send({ type: 'save', scope: 'workspace', values: { typeReference: '' } });
  assert.equal(updates.at(-1).value, undefined);
  assert.equal(config.get('colors.typeReference'), '#123456');
  for (const disposable of context.subscriptions) disposable.dispose();
});
