'use strict';

// Offsets are UTF-16, matching both VS Code and IntelliJ documents.
const builtins = ['integer', 'boolean', 'string', 'binary', 'double'];
const descriptions = {
  integer: '64 位整数 / 64-bit integer；integer(n) 表示 n 位小数的定点数 / fixed-point value with n decimal places。',
  boolean: '布尔值 / Boolean。', string: 'UTF-8 字符串 / UTF-8 string。', binary: '二进制数据 / Binary data。',
  double: '64 位浮点数 / 64-bit floating-point value。', nil: '协议不包含消息体 / No message body；response nil 表示仅确认 / confirmation only。'
};
function bilingual(message) {
  if (message.includes(' / ')) return message;
  const suffix = {
    '需要“{”。': 'Expected "{".', '需要“}”。': 'Expected "}".', '需要类型名称。': 'Expected a type name.',
    '点号后需要类型名称。': 'Expected a type name after the dot.', '需要字段名或嵌套类型。': 'Expected a field or nested type.',
    '字段名后需要非负整数编号。': 'Expected a non-negative field tag.', '协议名后需要非负整数编号。': 'Expected a non-negative protocol tag.',
    '字段编号后需要“:”。': 'Expected ":" after the field tag.', '需要 request 或 response。': 'Expected request or response.',
    '协议内只允许 request 和 response。': 'Only request and response are allowed in a protocol.',
    '需要“)”结束精度或字典索引。': 'Expected ")" after precision or dictionary key.', '此处需要空白分隔。': 'Whitespace is required here.'
  };
  if (suffix[message]) return `${message} / ${suffix[message]}`;
  if (message.startsWith('未定义的类型：')) return `${message} / Undefined type.`;
  if (message.startsWith('重复的')) return `${message} / Duplicate declaration.`;
  if (message.startsWith('无效的字典索引：')) return `${message} / Invalid dictionary key.`;
  if (message.startsWith('空索引字典')) return `${message} / An empty-key map requires exactly two fields.`;
  if (message.startsWith('字典索引需要')) return `${message} / A dictionary key requires an array of structures.`;
  if (message.startsWith('小数精度')) return `${message} / Invalid fixed-point precision.`;
  if (message.startsWith('integer 小数精度')) return `${message} / Integer precision must be between 0 and 10.`;
  if (message.startsWith('编号超出')) return `${message} / Tag exceeds the safe integer range.`;
  if (message.startsWith('类型 ') && message.endsWith('存在多个定义。')) return `${message} / Ambiguous type definition.`;
  return `${message} / Sproto syntax or type error.`;
}
function tokenize(text) {
  const tokens = [];
  const re = /\s+|#[^\r\n]*|[A-Za-z_][A-Za-z_0-9]*|[0-9]+|./gs;
  for (const m of text.matchAll(re)) {
    if (/^\s|^#/.test(m[0])) continue;
    tokens.push({ value: m[0], start: m.index, end: m.index + m[0].length,
      kind: /^[A-Za-z_]/.test(m[0]) ? 'id' : /^[0-9]/.test(m[0]) ? 'number' : m[0] });
  }
  tokens.push({ value: '', kind: 'eof', start: text.length, end: text.length });
  return tokens;
}
function parse(text, uri = '') {
  const tokens = tokenize(text), types = [], protocols = [], refs = [], diagnostics = [];
  let i = 0;
  const peek = () => tokens[i];
  const take = () => tokens[i++];
  const error = (t, message) => diagnostics.push({ start: t.start, end: t.end, message });
  function expect(kind, message) {
    if (peek().kind === kind) return take();
    error(peek(), message); throw new Error('recover');
  }
  function separated(a, b) {
    if (a.end === b.start) error(b, '此处需要空白分隔。');
  }
  function recovery(start) {
    if (i === start && peek().kind !== 'eof' && peek().kind !== '}') take();
    while (peek().kind !== 'eof' && peek().kind !== '}') {
      const prev = tokens[Math.max(0, i - 1)];
      if (/[\r\n]/.test(text.slice(prev.end, peek().start))) break;
      take();
    }
  }
  function qualified(scope, protocol = false) {
    const first = expect('id', '需要类型名称。');
    let name = first.value, end = first.end;
    while (peek().kind === '.' && peek().start === end) {
      const dot = take(), part = expect('id', '点号后需要类型名称。');
      if (dot.start !== end || dot.end !== part.start) error(dot, '限定类型名中的点号不能含空白。');
      name += '.' + part.value; end = part.end;
    }
    const ref = { name, start: first.start, end, scope, protocol, uri };
    refs.push(ref); return ref;
  }
  function body(owner, protocol) {
    const open = expect('{', '需要“{”。'); owner.bodyStart = open.end;
    while (peek().kind !== 'eof' && peek().kind !== '}') {
      const start = i;
      try {
        if (protocol) {
          const key = expect('id', '需要 request 或 response。');
          if (!['request', 'response'].includes(key.value)) { error(key, '协议内只允许 request 和 response。'); throw new Error('recover'); }
          if (owner.parts.has(key.value)) error(key, `重复的 ${key.value}。`);
          owner.parts.add(key.value);
          separated(key, peek());
          if (peek().kind === '{') {
            const type = { name: key.value, fullName: owner.name + '.' + key.value, start: key.start,
              end: key.end, uri, fields: [], kind: 'type', scope: owner.name, synthetic: true };
            types.push(type); body(type, false);
          } else qualified('', true);
        } else if (peek().kind === '.') declaration(owner.fullName);
        else {
          const name = expect('id', '需要字段名或嵌套类型。');
          const tag = expect('number', '字段名后需要非负整数编号。'); separated(name, tag);
          expect(':', '字段编号后需要“:”。');
          const array = peek().kind === '*'; if (array) take();
          const ref = qualified(owner.fullName);
          const field = { name: name.value, tag: Number(tag.value), start: name.start, end: name.end,
            tagStart: tag.start, tagEnd: tag.end, ref, array, uri, owner: owner.fullName, kind: 'field' };
          ref.field = field; owner.fields.push(field);
          if (peek().kind === '(') {
            const open = take(); let value = '';
            if (peek().kind === 'id' || peek().kind === 'number') value = take().value;
            const close = expect(')', '需要“)”结束精度或字典索引。');
            field.modifier = { value, start: open.start, end: close.end };
          }
        }
        if (peek().kind !== '}' && peek().kind !== 'eof') separated(tokens[i - 1], peek());
      } catch (e) { if (e.message !== 'recover') throw e; recovery(start); }
    }
    if (peek().kind === '}') owner.bodyEnd = take().end;
    else { owner.bodyEnd = text.length; error(peek(), '缺少“}”。'); }
  }
  function declaration(scope = '') {
    const dot = take(); const name = expect('id', '点号后需要类型名称。');
    if (dot.end !== name.start) error(dot, '类型声明的点号后不能含空白。');
    const type = { name: name.value, fullName: scope ? scope + '.' + name.value : name.value,
      scope, start: name.start, end: name.end, uri, fields: [], kind: 'type' };
    types.push(type); body(type, false);
  }
  while (peek().kind !== 'eof') {
    const start = i;
    try {
      if (peek().kind === '.') declaration();
      else {
        const name = expect('id', '需要“.类型名”或协议声明。');
        const tag = expect('number', '协议名后需要非负整数编号。'); separated(name, tag);
        const protocol = { name: name.value, tag: Number(tag.value), start: name.start, end: name.end,
          tagStart: tag.start, tagEnd: tag.end, uri, parts: new Set(), kind: 'protocol' };
        protocols.push(protocol); body(protocol, true);
      }
      if (peek().kind !== 'eof') separated(tokens[i - 1], peek());
    } catch (e) { if (e.message !== 'recover') throw e; recovery(start); if (peek().kind === '}') take(); }
  }
  function duplicates(items, key, label) {
    const seen = new Set();
    for (const item of items) {
      if (seen.has(item[key])) error(item, `重复的${label}：${item[key]}。`);
      seen.add(item[key]);
    }
  }
  duplicates(types, 'fullName', '类型'); duplicates(protocols, 'name', '协议'); duplicates(protocols, 'tag', '协议编号');
  for (const type of types) { duplicates(type.fields, 'name', '字段'); duplicates(type.fields, 'tag', '字段编号'); }
  for (const item of [...protocols, ...types.flatMap(t => t.fields)]) {
    if (!Number.isSafeInteger(item.tag)) error({ start: item.tagStart, end: item.tagEnd }, '编号超出安全整数范围。');
  }
  return { text, uri, tokens, types, protocols, refs, diagnostics: diagnostics.map(d => ({ ...d, message: bilingual(d.message) })) };
}
function resolve(ref, documents) {
  if ((!ref.protocol && builtins.includes(ref.name)) || (ref.protocol && ref.name === 'nil')) return [];
  const types = [...documents].flatMap(d => d.types);
  let scope = ref.protocol ? '' : ref.scope;
  for (;;) {
    const fullName = scope ? scope + '.' + ref.name : ref.name;
    const candidates = types.filter(t => t.fullName === fullName);
    const local = candidates.filter(t => t.uri === ref.uri);
    if (local.length || candidates.length) return local.length ? local : candidates;
    if (!scope) return [];
    scope = scope.includes('.') ? scope.slice(0, scope.lastIndexOf('.')) : '';
  }
}
function validate(doc, documents) {
  const result = [...doc.diagnostics];
  const error = (t, message) => result.push({ start: t.start, end: t.end, message });
  for (const ref of doc.refs) {
    const builtin = !ref.protocol && builtins.includes(ref.name);
    const target = resolve(ref, documents);
    if (!builtin && !(ref.protocol && ref.name === 'nil')) {
      if (!target.length) error(ref, `未定义的类型：${ref.name}。`);
      if (target.length > 1) error(ref, `类型 ${ref.name} 存在多个定义。`);
    }
    const field = ref.field, mod = field?.modifier;
    if (!mod) continue;
    if (/^\d+$/.test(mod.value)) {
      if (ref.name !== 'integer') error(mod, '小数精度只能用于 integer。');
      else if (!Number.isSafeInteger(Number(mod.value))) error(mod, '小数精度超出安全整数范围。');
    } else if (!field.array || builtin) error(mod, '字典索引需要结构体数组，例如 *Item(id)。');
    else if (target.length === 1) {
      const fields = target[0].fields;
      const key = mod.value ? fields.find(f => f.name === mod.value) : [...fields].sort((a, b) => a.tag - b.tag)[0];
      if (!mod.value && fields.length !== 2) error(mod, '空索引字典的结构体必须恰好包含两个字段。');
      if (!key || !builtins.includes(key.ref.name)) error(mod, `无效的字典索引：${mod.value || '(首字段)'}；索引必须是内置类型字段。`);
    }
  }
  return result.map(d => ({ ...d, message: bilingual(d.message) }));
}
function at(doc, offset) {
  return doc.refs.find(r => r.start <= offset && offset < r.end) ||
    [...doc.types, ...doc.protocols, ...doc.types.flatMap(t => t.fields)].find(t => t.start <= offset && offset < t.end);
}
function scopeAt(doc, offset) {
  return doc.types.filter(t => t.bodyStart <= offset && offset <= t.bodyEnd).sort((a, b) => b.bodyStart - a.bodyStart)[0];
}
function completions(doc, offset, documents) {
  const before = doc.text.slice(0, offset);
  const line = before.slice(before.lastIndexOf('\n') + 1);
  if (line.includes('#')) return [];
  const prefix = /[A-Za-z_0-9.]*$/.exec(before)[0];
  const start = offset - prefix.length;
  const previous = doc.tokens.filter(t => t.end <= start && t.kind !== 'eof').at(-1);
  const scope = scopeAt(doc, offset)?.fullName || '';
  const field = doc.types.flatMap(t => t.fields).find(f => f.modifier && f.modifier.start < offset && offset <= f.modifier.end);
  if (previous?.kind === '(' || field) {
    const ref = field?.ref || doc.refs.find(r => r.end <= start && /^[\s(]*$/.test(doc.text.slice(r.end, start)));
    if (ref?.name === 'integer') return [0, 2, 3, 6, 9].map(n => ({ label: String(n), kind: 'value', detail: '小数位数', start }));
    return resolve(ref || { name: '', scope, uri: doc.uri }, documents).flatMap(t => t.fields)
      .filter(f => builtins.includes(f.ref.name)).map(f => ({ label: f.name, kind: 'field', detail: f.ref.name, start }));
  }
  const protocolRef = ['request', 'response'].includes(previous?.value);
  if (previous?.kind === ':' || previous?.kind === '*' || protocolRef ||
      doc.refs.some(r => r.start <= start && start < r.end)) {
    const entries = (protocolRef ? ['nil'] : builtins).map(label => ({ label, kind: 'type', detail: descriptions[label], start }));
    const names = new Set([...documents].flatMap(d => d.types.map(t => t.fullName)));
    for (const name of names) {
      const parts = name.split('.'); const aliases = [name];
      for (let j = 1; j < parts.length; j++) aliases.push(parts.slice(j).join('.'));
      for (const alias of aliases) {
        const targets = resolve({ name: alias, scope, protocol: protocolRef, uri: doc.uri }, documents);
        if (targets.length === 1 && targets[0].fullName === name && !entries.some(e => e.label === alias))
          entries.push({ label: alias, kind: 'type', detail: name, start });
      }
    }
    return entries;
  }
  const protocol = doc.protocols.find(p => p.bodyStart <= offset && offset <= p.bodyEnd);
  if (protocol && !scopeAt(doc, offset)) return ['request', 'response'].map(label => ({ label, kind: 'keyword', detail: '协议消息', start }));
  return [{ label: 'type', kind: 'snippet', detail: '定义类型', insert: '.${1:TypeName} {\n\t${2:field} ${3:0} : ${4:integer}\n}', start },
    ...(scope ? [{ label: 'field', kind: 'snippet', detail: '定义字段', insert: '${1:name} ${2:0} : ${3:integer}', start }] :
      [{ label: 'protocol', kind: 'snippet', detail: '定义协议', insert: '${1:Name} ${2:1} {\n\trequest {\n\t}\n\tresponse nil\n}', start }])];
}
function describe(item) {
  if (descriptions[item.name] && item.scope !== undefined) return descriptions[item.name];
  if (item.kind === 'field') return `${item.owner}.${item.name} ${item.tag} : ${item.array ? '*' : ''}${item.ref.name}${item.modifier ? '(' + item.modifier.value + ')' : ''}`;
  if (item.kind === 'protocol') return `${item.name} ${item.tag} { request / response }`;
  return `.${item.fullName} {\n${item.fields.map(f => '  ' + describe(f).slice(f.owner.length + 1)).join('\n')}\n}`;
}
// Classify actual tokens rather than identifiers by spelling: a field named
// "request" or "integer" is still a field. Qualified names stay separate tokens.
function highlight(doc) {
  const roles = new Map();
  const fields = doc.types.flatMap(t => t.fields);
  for (const type of doc.types) if (!type.synthetic) roles.set(type.start, ['sprotoType', ['declaration']]);
  for (const protocol of doc.protocols) roles.set(protocol.start, ['sprotoProtocol', ['declaration']]);
  for (const field of fields) roles.set(field.start, ['sprotoField', ['declaration']]);
  for (const field of fields) roles.set(field.tagStart, ['number', ['fieldTag']]);
  for (const protocol of doc.protocols) roles.set(protocol.tagStart, ['number', ['protocolTag']]);
  const tokens = doc.tokens.filter(t => t.kind !== 'eof');
  for (const match of doc.text.matchAll(/#[^\r\n]*/g))
    tokens.push({ start: match.index, end: match.index + match[0].length, kind: 'comment', value: match[0] });
  return tokens.sort((a, b) => a.start - b.start).map(token => {
    let role = roles.get(token.start);
    if (!role) {
      const ref = doc.refs.find(r => r.start <= token.start && token.end <= r.end);
      const field = fields.find(f => f.modifier && f.modifier.start < token.start && token.end < f.modifier.end);
      if (token.kind === 'comment') role = ['comment', []];
      else if (token.kind === 'number') role = ['number', field ? ['precision'] : []];
      else if (token.kind === 'id' && ref) role = builtins.includes(ref.name) || ref.name === 'nil' ?
        ['sprotoBuiltin', [ref.name]] : ['sprotoType', ['reference']];
      else if (token.kind === 'id' && field) role = ['sprotoField', ['reference']];
      else if (['request', 'response'].includes(token.value)) role = ['keyword', [token.value]];
      else if (builtins.includes(token.value) || token.value === 'nil') role = ['sprotoBuiltin', [token.value]];
      else if (token.kind === 'id') role = ['variable', []];
      else {
        const punctuation = { ':': 'fieldSeparator', '*': 'array', '{': 'braces', '}': 'braces', '(': 'parentheses', ')': 'parentheses' };
        role = ['sprotoPunctuation', [token.kind === '.' ?
          (doc.types.some(t => !t.synthetic && t.start === token.end) ? 'typeMarker' : 'typeSeparator') :
          (punctuation[token.value] || 'unknown')]];
      }
    }
    return { start: token.start, end: token.end, type: role[0], modifiers: role[1] };
  });
}
const highlightTypes = ['sprotoType', 'sprotoField', 'sprotoProtocol', 'sprotoBuiltin', 'keyword', 'number', 'variable', 'comment', 'sprotoPunctuation'];
const highlightModifiers = ['declaration', 'reference', ...builtins, 'nil', 'request', 'response', 'fieldTag', 'protocolTag', 'precision',
  'typeMarker', 'typeSeparator', 'fieldSeparator', 'array', 'braces', 'parentheses', 'unknown'];
module.exports = { builtins, descriptions, tokenize, parse, resolve, validate, at, scopeAt, completions, describe, highlight, highlightTypes, highlightModifiers };
