'use strict';
const crypto = require('node:crypto');

// These keys are shared by the GUI, settings schema, and token decorations.
const categories = [
  ['typeDeclaration', '类型声明 / Type declaration', 'sprotoType', 'declaration'], ['typeReference', '类型引用 / Type reference', 'sprotoType', 'reference'],
  ['fieldDeclaration', '字段声明 / Field declaration', 'sprotoField', 'declaration'], ['fieldReference', '字段引用 / 字典键 / Field reference / dictionary key', 'sprotoField', 'reference'],
  ['protocolDeclaration', '协议方法声明 / Protocol method declaration', 'sprotoProtocol', 'declaration'],
  ...['integer', 'boolean', 'string', 'binary', 'double', 'nil'].map(name => [name, `${name} 内置类型 / Built-in type`, 'sprotoBuiltin', name]),
  ['request', 'request 关键字 / request keyword', 'keyword', 'request'], ['response', 'response 关键字 / response keyword', 'keyword', 'response'],
  ['fieldTag', '字段编号 / Field tag', 'number', 'fieldTag'], ['protocolTag', '协议编号 / Protocol tag', 'number', 'protocolTag'],
  ['precision', '小数精度 / Fixed-point precision', 'number', 'precision'], ['number', '其他数字 / Other numbers', 'number', ''], ['comment', '行注释 / Line comment', 'comment', ''],
  ...[['typeMarker', '声明点号 / Type marker'], ['typeSeparator', '类型限定点号 / Type separator'], ['fieldSeparator', '字段冒号 / Field separator'], ['array', '数组星号 / Array marker'],
    ['braces', '大括号 / Braces'], ['parentheses', '圆括号 / Parentheses']].map(([key, label]) => [key, label, 'sprotoPunctuation', key])
].map(([key, label, type, modifier]) => ({ key, label, type, modifier }));
const validColor = value => typeof value === 'string' && (value === '' || /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value));
function categoryFor(token) {
  return categories.find(c => c.type === token.type && (c.modifier ? token.modifiers.includes(c.modifier) : token.modifiers.length === 0));
}

function register(vscode, context, core, model) {
  const decorations = new Map();
  const panels = new Set();
  let refreshTimer;
  function paint() {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.languageId !== 'sproto') {
        for (const decoration of decorations.values()) editor.setDecorations(decoration, []);
        continue;
      }
      const config = vscode.workspace.getConfiguration('sproto', editor.document.uri);
      const groups = new Map();
      for (const category of categories) {
        const color = config.get(`colors.${category.key}`, '');
        if (!color || !validColor(color)) continue;
        if (!decorations.has(color)) decorations.set(color, vscode.window.createTextEditorDecorationType({ color, rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed }));
        groups.set(category.key, { color, ranges: [] });
      }
      if (groups.size) for (const token of core.highlight(model(editor.document))) {
        const category = categoryFor(token), group = groups.get(category?.key);
        if (group) group.ranges.push(new vscode.Range(editor.document.positionAt(token.start), editor.document.positionAt(token.end)));
      }
      for (const [color, decoration] of decorations)
        editor.setDecorations(decoration, [...groups.values()].filter(g => g.color === color).flatMap(g => g.ranges));
    }
  }
  function schedule() { clearTimeout(refreshTimer); refreshTimer = setTimeout(paint, 80); }
  function resetDecorations() { for (const value of decorations.values()) value.dispose(); decorations.clear(); }
  function openPanel() {
    const resource = vscode.window.activeTextEditor?.document.uri || vscode.workspace.workspaceFolders?.[0]?.uri;
    const panel = vscode.window.createWebviewPanel('sprotoColors', 'Sproto 高亮颜色 / Sproto Highlight Colors', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] });
    panels.add(panel);
    const nonce = crypto.randomBytes(16).toString('hex');
    panel.webview.html = html(panel.webview.cspSource, nonce);
    function state(scope) {
      const config = vscode.workspace.getConfiguration('sproto', resource);
      const field = scope === 'workspace' ? 'workspaceValue' : scope === 'folder' ? 'workspaceFolderValue' : 'globalValue';
      return { type: 'state', scope, hasWorkspace: !!vscode.workspace.workspaceFolders?.length,
        hasFolder: !!(resource && vscode.workspace.getWorkspaceFolder(resource)), rows: categories.map(c => {
          const value = config.inspect(`colors.${c.key}`)?.[field], effective = config.get(`colors.${c.key}`, '');
          return { key: c.key, label: c.label, color: validColor(value) ? value : '', effective: validColor(effective) ? effective : '' };
        }) };
    }
    const messageSubscription = panel.webview.onDidReceiveMessage(async message => {
      try {
        if (!message || !['load', 'save'].includes(message.type) || !['user', 'workspace', 'folder'].includes(message.scope)) return;
        if (message.type === 'load') { await panel.webview.postMessage(state(message.scope)); return; }
        if (message.scope !== 'user' && !vscode.workspace.workspaceFolders?.length) throw new Error('请先打开工作区 / Open a workspace first.');
        if (message.scope === 'folder' && !(resource && vscode.workspace.getWorkspaceFolder(resource))) throw new Error('没有可用的工作区文件夹 / No workspace folder is available.');
        if (!message.values || typeof message.values !== 'object' || Array.isArray(message.values)) throw new Error('颜色配置无效 / Invalid color configuration.');
        for (const [key, value] of Object.entries(message.values))
          if (!categories.some(c => c.key === key) || !validColor(value)) throw new Error(`无效的颜色配置 / Invalid color: ${key}`);
        const config = vscode.workspace.getConfiguration('sproto', resource);
        const target = message.scope === 'workspace' ? vscode.ConfigurationTarget.Workspace :
          message.scope === 'folder' ? vscode.ConfigurationTarget.WorkspaceFolder : vscode.ConfigurationTarget.Global;
        const field = message.scope === 'workspace' ? 'workspaceValue' : message.scope === 'folder' ? 'workspaceFolderValue' : 'globalValue';
        for (const [key, value] of Object.entries(message.values)) {
          // Empty means remove this scope's override and inherit the parent/native theme.
          const current = config.inspect(`colors.${key}`)?.[field];
          if (current !== (value || undefined)) await config.update(`colors.${key}`, value || undefined, target);
        }
        await panel.webview.postMessage({ type: 'saved' });
        await panel.webview.postMessage(state(message.scope));
      } catch (error) { await panel.webview.postMessage({ type: 'error', message: error.message }); }
    });
    panel.onDidDispose(() => { panels.delete(panel); messageSubscription.dispose(); });
  }
  context.subscriptions.push(
    vscode.commands.registerCommand('sproto.configureColors', openPanel),
    vscode.commands.registerCommand('sproto.openSettings', () => {
      const manifest = context.extension.packageJSON;
      return vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${manifest.publisher}.${manifest.name}`);
    }),
    vscode.window.onDidChangeVisibleTextEditors(schedule),
    vscode.workspace.onDidOpenTextDocument(schedule),
    vscode.workspace.onDidCloseTextDocument(schedule),
    vscode.workspace.onDidChangeTextDocument(e => { if (e.document.languageId === 'sproto') schedule(); }),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('sproto')) { resetDecorations(); schedule(); } }),
    { dispose() { clearTimeout(refreshTimer); resetDecorations(); for (const panel of panels) panel.dispose(); } }
  );
  schedule();
}

function html(source, nonce) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style nonce="${nonce}">
body{font:var(--vscode-font-size) var(--vscode-font-family);color:var(--vscode-foreground);padding:20px;max-width:950px}
h1{font-size:24px}p{line-height:1.6}button,select,input{font:inherit;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent);padding:6px;border-radius:3px}
button{cursor:pointer;background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:8px 14px}button:disabled{opacity:.5;cursor:default}
.toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.row{display:grid;grid-template-columns:minmax(160px,1fr) 52px 130px 100px;gap:14px;align-items:center;padding:10px 0;border-bottom:1px solid var(--vscode-panel-border)}
input[type=color]{width:50px;height:34px;padding:2px}input[type=text]{width:115px}small{display:block;color:var(--vscode-descriptionForeground);margin-top:4px}.message{min-height:28px;margin:12px 0}.inherit{white-space:nowrap}@media(max-width:600px){.row{grid-template-columns:1fr 52px 130px}.inherit{grid-column:1/-1}}
</style></head><body><h1>Sproto 高亮颜色 / Sproto Highlight Colors</h1>
<p>声明和引用可以分别设置 / Declarations and references are independent. 使用颜色选择器或输入 #RRGGBB / #RRGGBBAA；use the picker or enter a hex value. 勾选“继承”可移除当前范围的覆盖 / check Inherit to remove the current override. 字段默认白色，内置类型默认蓝色，数字默认跟随主题 / Fields default to white, built-ins to blue, and numbers follow the theme.</p>
<div class="toolbar"><label>保存范围 / Save scope <select id="scope"><option value="user">用户</option><option value="workspace">工作区</option><option value="folder">当前文件夹</option></select></label><button id="save">保存颜色 / Save colors</button><button id="reset">全部继承 / Inherit all</button></div>
<div class="message" id="message" role="status" aria-live="polite"></div><div id="rows"></div>
<script nonce="${nonce}">
const api=acquireVsCodeApi();const scope=document.getElementById('scope'),rows=document.getElementById('rows'),status=document.getElementById('message'),save=document.getElementById('save');
const valid=v=>/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v);let dirty=false;
function load(){api.postMessage({type:'load',scope:scope.value})}load();
scope.addEventListener('change',()=>{if(dirty&&!confirm('切换范围会放弃未保存的修改，继续吗？')){scope.value=scope.dataset.previous;return}scope.dataset.previous=scope.value;dirty=false;status.textContent='';load()});scope.dataset.previous='user';
window.addEventListener('message',event=>{const data=event.data;if(data.type==='error'){status.textContent=data.message;save.disabled=false;return}if(data.type==='saved'){status.textContent='颜色已保存 / Colors saved';save.disabled=false;dirty=false;return}if(data.type!=='state')return;
scope.querySelector('[value=workspace]').disabled=!data.hasWorkspace;scope.querySelector('[value=folder]').disabled=!data.hasFolder;rows.replaceChildren();
for(const entry of data.rows){const row=document.createElement('div');row.className='row';row.dataset.key=entry.key;
const label=document.createElement('label');label.textContent=entry.label;const hint=document.createElement('small');hint.textContent=entry.effective?'当前有效覆盖 / Effective override: '+entry.effective:'编辑器 / 主题默认 / Editor or theme default';label.append(hint);
const picker=document.createElement('input');picker.type='color';picker.value=entry.color?entry.color.slice(0,7):entry.effective?entry.effective.slice(0,7):'#808080';picker.setAttribute('aria-label',entry.label+'颜色选择器');
const text=document.createElement('input');text.type='text';text.placeholder='继承默认 / Inherit default';text.value=entry.color;text.setAttribute('aria-label',entry.label+'十六进制颜色');label.htmlFor='hex-'+entry.key;text.id='hex-'+entry.key;
const inheritLabel=document.createElement('label');inheritLabel.className='inherit';const inherit=document.createElement('input');inherit.type='checkbox';inherit.checked=!entry.color;inheritLabel.append(inherit,document.createTextNode(' 继承'));
picker.addEventListener('input',()=>{text.value=picker.value;inherit.checked=false;dirty=true});text.addEventListener('input',()=>{inherit.checked=!text.value;if(valid(text.value))picker.value=text.value.slice(0,7);dirty=true});inherit.addEventListener('change',()=>{text.value=inherit.checked?'':picker.value;dirty=true});
row.append(label,picker,text,inheritLabel);rows.append(row)}});
save.addEventListener('click',()=>{const values={};for(const row of rows.children){const value=row.querySelector('[type=text]').value.trim();if(value&&!valid(value)){status.textContent='请输入有效的十六进制颜色：'+row.dataset.key;return}values[row.dataset.key]=value}save.disabled=true;status.textContent='保存中… / Saving…';api.postMessage({type:'save',scope:scope.value,values})});
document.getElementById('reset').addEventListener('click',()=>{for(const row of rows.children){row.querySelector('[type=text]').value='';row.querySelector('[type=checkbox]').checked=true}dirty=true;status.textContent='已选择全部继承 / Inherit all，点击保存后生效'});
</script></body></html>`;
}
module.exports = { categories, validColor, categoryFor, register, html };

