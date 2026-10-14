'use strict';
const vscode = require('vscode');
const core = require('./core');

function activate(context) {
  const models = new Map();
  const diagnostics = vscode.languages.createDiagnosticCollection('sproto');
  const selector = { language: 'sproto', scheme: '*' };
  const output = vscode.window.createOutputChannel('Sproto');
  const legend = new vscode.SemanticTokensLegend(core.highlightTypes, core.highlightModifiers);
  let timer;
  const key = uri => uri.toString();
  function update(document) {
    if (document.languageId === 'sproto') models.set(key(document.uri), core.parse(document.getText(), key(document.uri)));
  }
  function model(document) { update(document); return models.get(key(document.uri)); }
  function documents(document) {
    // Keep dirty editors authoritative, even before their debounced diagnostics run.
    vscode.workspace.textDocuments.forEach(update);
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    return [...models.values()].filter(m => m.uri === key(document.uri) ||
      (folder && vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(m.uri))?.uri.toString() === folder.uri.toString()));
  }
  const range = (doc, item) => new vscode.Range(doc.positionAt(item.start), doc.positionAt(item.end));
  require('./colors').register(vscode, context, core, model);
  function publish() {
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.languageId !== 'sproto') continue;
      const m = model(doc), all = documents(doc);
      diagnostics.set(doc.uri, core.validate(m, all).map(issue => {
        const r = range(doc, { start: issue.start, end: Math.max(issue.end, Math.min(doc.getText().length, issue.start + 1)) });
        const d = new vscode.Diagnostic(r, issue.message, vscode.DiagnosticSeverity.Error);
        d.source = 'sproto'; return d;
      }));
    }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(publish, 200); }
  async function load(uri) {
    try {
      const open = vscode.workspace.textDocuments.find(d => key(d.uri) === key(uri));
      if (open) update(open);
      else models.set(key(uri), core.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'), key(uri)));
    } catch (e) { models.delete(key(uri)); output.appendLine(`Cannot read ${uri}: ${e.message}`); }
  }
  async function scan() {
    const uris = await vscode.workspace.findFiles('**/*.sproto', '**/{.git,node_modules,Library,Temp,build,dist}/**');
    // Limit parallel reads for projects with many protocol files.
    for (let i = 0; i < uris.length; i += 32) await Promise.all(uris.slice(i, i + 32).map(load));
    vscode.workspace.textDocuments.forEach(update); schedule();
  }
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.sproto');
  context.subscriptions.push(diagnostics, output, watcher,
    watcher.onDidCreate(async uri => { await load(uri); schedule(); }),
    watcher.onDidChange(async uri => { await load(uri); schedule(); }),
    watcher.onDidDelete(uri => { models.delete(key(uri)); diagnostics.delete(uri); schedule(); }),
    vscode.workspace.onDidOpenTextDocument(doc => { update(doc); schedule(); }),
    vscode.workspace.onDidChangeTextDocument(e => { update(e.document); schedule(); }),
    vscode.workspace.onDidCloseTextDocument(async doc => {
      diagnostics.delete(doc.uri);
      if (doc.uri.scheme === 'file') await load(doc.uri); else models.delete(key(doc.uri));
      schedule();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => { models.clear(); scan().catch(e => output.appendLine(e.message)); }),
    { dispose: () => clearTimeout(timer) },
    vscode.languages.registerDocumentSemanticTokensProvider(selector, {
      provideDocumentSemanticTokens(doc) {
        const builder = new vscode.SemanticTokensBuilder(legend);
        for (const token of core.highlight(model(doc))) builder.push(range(doc, token), token.type, token.modifiers);
        return builder.build();
      }
    }, legend),
    vscode.languages.registerDefinitionProvider(selector, {
      async provideDefinition(doc, position) {
        const m = model(doc), item = core.at(m, doc.offsetAt(position));
        if (!item || item.kind) return undefined;
        return Promise.all(core.resolve(item, documents(doc)).map(async target => {
          const destination = await vscode.workspace.openTextDocument(vscode.Uri.parse(target.uri));
          return new vscode.Location(destination.uri, range(destination, target));
        }));
      }
    }),
    vscode.languages.registerCompletionItemProvider(selector, {
      provideCompletionItems(doc, position) {
        return core.completions(model(doc), doc.offsetAt(position), documents(doc)).map(entry => {
          const kinds = { type: vscode.CompletionItemKind.Struct, field: vscode.CompletionItemKind.Field,
            keyword: vscode.CompletionItemKind.Keyword, snippet: vscode.CompletionItemKind.Snippet, value: vscode.CompletionItemKind.Value };
          const item = new vscode.CompletionItem(entry.label, kinds[entry.kind]);
          item.detail = entry.detail;
          item.range = new vscode.Range(doc.positionAt(entry.start), position);
          if (entry.insert) item.insertText = new vscode.SnippetString(entry.insert);
          return item;
        });
      }
    }, ':', '*', '.', '('),
    vscode.languages.registerHoverProvider(selector, {
      provideHover(doc, position) {
        const item = core.at(model(doc), doc.offsetAt(position));
        if (!item) return undefined;
        const markdown = new vscode.MarkdownString();
        if (!item.kind && core.descriptions[item.name]) markdown.appendText(core.descriptions[item.name]);
        else {
          const target = item.kind ? item : core.resolve(item, documents(doc))[0];
          if (!target) return undefined;
          markdown.appendCodeblock(core.describe(target), 'sproto');
        }
        return new vscode.Hover(markdown, range(doc, item));
      }
    }),
    vscode.languages.registerDocumentSymbolProvider(selector, {
      provideDocumentSymbols(doc) {
        const m = model(doc);
        return [...m.types, ...m.protocols].map(t => {
          const symbol = new vscode.DocumentSymbol(t.fullName || t.name, t.kind,
            t.kind === 'protocol' ? vscode.SymbolKind.Function : vscode.SymbolKind.Struct,
            range(doc, { start: t.start, end: t.bodyEnd ?? t.end }), range(doc, t));
          symbol.children = (t.fields || []).map(f => new vscode.DocumentSymbol(f.name, f.ref.name,
            vscode.SymbolKind.Field, range(doc, f), range(doc, f)));
          return symbol;
        });
      }
    }));
  scan().catch(e => output.appendLine(`Workspace scan failed: ${e.message}`));
}
module.exports = { activate };
