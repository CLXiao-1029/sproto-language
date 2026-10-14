package dev.sproto;

import java.util.*;
import java.util.regex.*;

/** Dependency-free language model. All source positions use UTF-16 offsets. */
public final class SprotoModel {
    private static String bilingual(String message) {
        if (message.contains(" / ")) return message;
        if (message.startsWith("未定义的类型：")) return message + " / Undefined type.";
        if (message.startsWith("重复的")) return message + " / Duplicate declaration.";
        if (message.startsWith("无效的字典索引：")) return message + " / Invalid dictionary key.";
        if (message.startsWith("字典索引需要")) return message + " / A dictionary key requires an array of structures.";
        if (message.startsWith("空索引字典")) return message + " / An empty-key map requires exactly two fields.";
        if (message.startsWith("小数精度") || message.startsWith("integer 小数精度")) return message + " / Invalid fixed-point precision.";
        if (message.startsWith("编号超出")) return message + " / Tag exceeds the safe integer range.";
        return message + " / Sproto syntax or type error.";
    }
    public static final List<String> BUILTINS = List.of("integer", "boolean", "string", "binary", "double");
    public record Token(String value, String kind, int start, int end) {}
    public record Issue(int start, int end, String message) {}
    public record Modifier(String value, int start, int end) {}
    public record Completion(String label, String detail, String kind, int start) {}
    public record Highlight(int start, int end, String role) {}
    public static class Symbol {
        public String name, fullName, scope, uri, kind;
        public int start, end, bodyStart = -1, bodyEnd;
        public long tag;
        public boolean synthetic;
        public int tagStart, tagEnd;
        public final List<Field> fields = new ArrayList<>();
        public final Set<String> parts = new HashSet<>();
        Symbol(String name, String scope, String uri, String kind, int start, int end) {
            this.name = name; this.scope = scope; this.uri = uri; this.kind = kind;
            this.start = start; this.end = end;
            fullName = scope.isEmpty() ? name : scope + "." + name;
        }
    }
    public static final class Field extends Symbol {
        public Ref ref;
        public boolean array;
        public Modifier modifier;
        Field(Token name, Token tag, String scope, String uri) {
            super(name.value, scope, uri, "field", name.start, name.end);
            this.tag = number(tag.value); tagStart = tag.start; tagEnd = tag.end;
        }
    }
    public static final class Ref {
        public String name, scope, uri;
        public int start, end;
        public boolean protocol;
        public Field field;
        Ref(String name, String scope, String uri, int start, int end, boolean protocol) {
            this.name = name; this.scope = scope; this.uri = uri; this.start = start; this.end = end; this.protocol = protocol;
        }
        public boolean builtin() { return !protocol && BUILTINS.contains(name) || protocol && name.equals("nil"); }
    }
    public final String text, uri;
    public final List<Token> tokens;
    public final List<Symbol> types = new ArrayList<>(), protocols = new ArrayList<>();
    public final List<Ref> refs = new ArrayList<>();
    public final List<Issue> issues = new ArrayList<>();
    private int cursor;
    private static final Pattern TOKEN = Pattern.compile("\\s+|#[^\\r\\n]*|[A-Za-z_][A-Za-z_0-9]*|[0-9]+|.", Pattern.DOTALL);
    private static final class Recover extends RuntimeException {
        @Override public synchronized Throwable fillInStackTrace() { return this; }
    }
    public static List<Token> tokenize(String text) {
        List<Token> result = new ArrayList<>();
        Matcher m = TOKEN.matcher(text);
        while (m.find()) {
            String value = m.group(); char c = value.charAt(0);
            String kind = Character.isWhitespace(c) ? "space" : c == '#' ? "comment" :
                value.matches("[A-Za-z_][A-Za-z_0-9]*") ? "id" : value.matches("[0-9]+") ? "number" : value;
            result.add(new Token(value, kind, m.start(), m.end()));
        }
        return result;
    }
    public SprotoModel(String text, String uri) {
        this.text = text; this.uri = uri;
        tokens = new ArrayList<>(tokenize(text).stream().filter(t -> !List.of("space", "comment").contains(t.kind)).toList());
        tokens.add(new Token("", "eof", text.length(), text.length()));
        while (!peek().kind.equals("eof")) {
            int start = cursor;
            try {
                if (peek().kind.equals(".")) declaration("");
                else {
                    Token name = expect("id", "需要“.类型名”或协议声明。"), tag = expect("number", "协议名后需要非负整数编号。");
                    separated(name, tag);
                    Symbol p = new Symbol(name.value, "", uri, "protocol", name.start, name.end);
                    p.tag = number(tag.value); p.tagStart = tag.start; p.tagEnd = tag.end;
                    protocols.add(p); body(p, true);
                }
                if (!peek().kind.equals("eof")) separated(tokens.get(cursor - 1), peek());
            } catch (Recover e) { recover(start); if (peek().kind.equals("}")) take(); }
        }
        duplicates(types, "type"); duplicates(protocols, "protocol");
        for (Symbol type : types) duplicates(new ArrayList<>(type.fields), "field");
        for (Symbol p : protocols) checkTag(p);
        for (Symbol t : types) for (Field f : t.fields) checkTag(f);
        for (int i = 0; i < issues.size(); i++) { Issue issue = issues.get(i); issues.set(i, new Issue(issue.start(), issue.end(), bilingual(issue.message()))); }
    }
    private static long number(String value) {
        try { return Long.parseLong(value); } catch (NumberFormatException e) { return Long.MAX_VALUE; }
    }
    private void checkTag(Symbol s) {
        if (s.tag > 9007199254740991L) issues.add(new Issue(s.tagStart, s.tagEnd, "编号超出安全整数范围。"));
    }
    private Token peek() { return tokens.get(cursor); }
    private Token take() { return tokens.get(cursor++); }
    private void error(Token token, String message) { issues.add(new Issue(token.start, token.end, message)); }
    private Token expect(String kind, String message) {
        if (peek().kind.equals(kind)) return take();
        error(peek(), message); throw new Recover();
    }
    private void separated(Token a, Token b) { if (a.end == b.start) error(b, "此处需要空白分隔。"); }
    private void recover(int start) {
        if (cursor == start && !List.of("eof", "}").contains(peek().kind)) take();
        while (!List.of("eof", "}").contains(peek().kind)) {
            if (text.substring(tokens.get(Math.max(0, cursor - 1)).end, peek().start).matches("(?s).*[\\r\\n].*")) break;
            take();
        }
    }
    private Ref qualified(String scope, boolean protocol) {
        Token first = expect("id", "需要类型名称。"); String name = first.value; int end = first.end;
        while (peek().kind.equals(".") && peek().start == end) {
            Token dot = take(), part = expect("id", "点号后需要类型名称。");
            if (dot.start != end || dot.end != part.start) error(dot, "限定类型名中的点号不能含空白。");
            name += "." + part.value; end = part.end;
        }
        Ref ref = new Ref(name, scope, uri, first.start, end, protocol); refs.add(ref); return ref;
    }
    private void declaration(String scope) {
        Token dot = take(), name = expect("id", "点号后需要类型名称。");
        if (dot.end != name.start) error(dot, "类型声明的点号后不能含空白。");
        Symbol type = new Symbol(name.value, scope, uri, "type", name.start, name.end);
        types.add(type); body(type, false);
    }
    private void body(Symbol owner, boolean protocol) {
        owner.bodyStart = expect("{", "需要“{”。").end;
        while (!List.of("eof", "}").contains(peek().kind)) {
            int start = cursor;
            try {
                if (protocol) {
                    Token key = expect("id", "需要 request 或 response。");
                    if (!List.of("request", "response").contains(key.value)) { error(key, "协议内只允许 request 和 response。"); throw new Recover(); }
                    if (!owner.parts.add(key.value)) error(key, "重复的 " + key.value + "。");
                    separated(key, peek());
                    if (peek().kind.equals("{")) {
                        Symbol type = new Symbol(key.value, owner.name, uri, "type", key.start, key.end);
                        type.synthetic = true;
                        types.add(type); body(type, false);
                    } else qualified("", true);
                } else if (peek().kind.equals(".")) declaration(owner.fullName);
                else {
                    Token name = expect("id", "需要字段名或嵌套类型。"), tag = expect("number", "字段名后需要非负整数编号。");
                    separated(name, tag); expect(":", "字段编号后需要“:”。");
                    boolean array = peek().kind.equals("*"); if (array) take();
                    Ref ref = qualified(owner.fullName, false);
                    Field field = new Field(name, tag, owner.fullName, uri);
                    field.ref = ref; field.array = array; ref.field = field; owner.fields.add(field);
                    if (peek().kind.equals("(")) {
                        Token open = take(); String value = "";
                        if (List.of("id", "number").contains(peek().kind)) value = take().value;
                        Token close = expect(")", "需要“)”结束精度或字典索引。");
                        field.modifier = new Modifier(value, open.start, close.end);
                    }
                }
                if (!List.of("eof", "}").contains(peek().kind)) separated(tokens.get(cursor - 1), peek());
            } catch (Recover e) { recover(start); }
        }
        if (peek().kind.equals("}")) owner.bodyEnd = take().end;
        else { owner.bodyEnd = text.length(); error(peek(), "缺少“}”。"); }
    }
    private void duplicates(List<Symbol> symbols, String kind) {
        Set<String> names = new HashSet<>(); Set<Long> tags = new HashSet<>();
        String label = kind.equals("type") ? "类型" : kind.equals("field") ? "字段" : "协议";
        for (Symbol symbol : symbols) {
            String name = kind.equals("type") ? symbol.fullName : symbol.name;
            if (!names.add(name)) issues.add(new Issue(symbol.start, symbol.end, "重复的" + label + "：" + name + "。"));
            if (!kind.equals("type") && !tags.add(symbol.tag)) issues.add(new Issue(symbol.start, symbol.end, "重复的" + label + "编号：" + symbol.tag + "。"));
        }
    }
    public static List<Symbol> resolve(Ref ref, Collection<SprotoModel> documents) {
        if (ref.builtin()) return List.of();
        String scope = ref.protocol ? "" : ref.scope;
        for (;;) {
            String name = scope.isEmpty() ? ref.name : scope + "." + ref.name;
            List<Symbol> targets = documents.stream().flatMap(d -> d.types.stream()).filter(t -> t.fullName.equals(name)).toList();
            List<Symbol> local = targets.stream().filter(t -> t.uri.equals(ref.uri)).toList();
            if (!local.isEmpty() || !targets.isEmpty()) return local.isEmpty() ? targets : local;
            if (scope.isEmpty()) return List.of();
            int dot = scope.lastIndexOf('.'); scope = dot < 0 ? "" : scope.substring(0, dot);
        }
    }
    public List<Issue> validate(Collection<SprotoModel> documents) {
        List<Issue> result = new ArrayList<>(issues);
        for (Ref ref : refs) {
            List<Symbol> targets = resolve(ref, documents);
            if (!ref.builtin()) {
                if (targets.isEmpty()) result.add(new Issue(ref.start, ref.end, "未定义的类型：" + ref.name + "。"));
                if (targets.size() > 1) result.add(new Issue(ref.start, ref.end, "类型 " + ref.name + " 存在多个定义。"));
            }
            Field field = ref.field; Modifier mod = field == null ? null : field.modifier;
            if (mod == null) continue;
            if (mod.value.matches("[0-9]+")) {
                if (!ref.name.equals("integer")) result.add(new Issue(mod.start, mod.end, "小数精度只能用于 integer。"));
                else if (number(mod.value) > 9007199254740991L) result.add(new Issue(mod.start, mod.end, "小数精度超出安全整数范围。"));
            } else if (!field.array || BUILTINS.contains(ref.name)) result.add(new Issue(mod.start, mod.end, "字典索引需要结构体数组，例如 *Item(id)。"));
            else if (targets.size() == 1) {
                List<Field> fields = targets.getFirst().fields;
                Field key = mod.value.isEmpty() ? fields.stream().min(Comparator.comparingLong(f -> f.tag)).orElse(null) :
                    fields.stream().filter(f -> f.name.equals(mod.value)).findFirst().orElse(null);
                if (mod.value.isEmpty() && fields.size() != 2) result.add(new Issue(mod.start, mod.end, "空索引字典的结构体必须恰好包含两个字段。"));
                if (key == null || !BUILTINS.contains(key.ref.name)) result.add(new Issue(mod.start, mod.end, "无效的字典索引：" + (mod.value.isEmpty() ? "(首字段)" : mod.value) + "；索引必须是内置类型字段。"));
            }
        }
        return result.stream().map(i -> new Issue(i.start(), i.end(), bilingual(i.message()))).toList();
    }
    public Ref refAt(int offset) { return refs.stream().filter(r -> r.start <= offset && offset < r.end).findFirst().orElse(null); }
    public List<Highlight> highlight() {
        Map<Integer, String> roles = new HashMap<>();
        for (Symbol type : types) if (!type.synthetic) roles.put(type.start, "typeDeclaration");
        for (Symbol p : protocols) { roles.put(p.start, "protocolDeclaration"); roles.put(p.tagStart, "protocolTag"); }
        List<Field> fields = types.stream().flatMap(t -> t.fields.stream()).toList();
        for (Field field : fields) { roles.put(field.start, "fieldDeclaration"); roles.put(field.tagStart, "fieldTag"); }
        List<Highlight> result = new ArrayList<>();
        for (Token token : tokenize(text)) {
            if (token.kind.equals("space")) continue;
            String role = roles.get(token.start);
            if (role == null) {
                Ref ref = refAt(token.start);
                boolean inModifier = fields.stream().anyMatch(f -> f.modifier != null && f.modifier.start < token.start && token.end < f.modifier.end);
                if (token.kind.equals("comment")) role = "comment";
                else if (token.kind.equals("number")) role = inModifier ? "precision" : "number";
                else if (token.kind.equals("id") && ref != null) role = BUILTINS.contains(ref.name) || ref.name.equals("nil") ? ref.name : "typeReference";
                else if (token.kind.equals("id") && inModifier) role = "fieldReference";
                else if (List.of("request", "response").contains(token.value)) role = token.value;
                else if (BUILTINS.contains(token.value) || token.value.equals("nil")) role = token.value;
                else if (token.kind.equals("id")) role = "identifier";
                else role = switch (token.kind) {
                    case "." -> types.stream().anyMatch(t -> !t.synthetic && t.start == token.end) ? "typeMarker" : "typeSeparator";
                    case ":" -> "fieldSeparator"; case "*" -> "array";
                    case "{", "}" -> "braces"; case "(", ")" -> "parentheses"; default -> "unknown";
                };
            }
            result.add(new Highlight(token.start, token.end, role));
        }
        return result;
    }
    public Symbol symbolAt(int offset) {
        List<Symbol> all = new ArrayList<>(types); all.addAll(protocols); for (Symbol t : types) all.addAll(t.fields);
        return all.stream().filter(s -> s.start <= offset && offset < s.end).findFirst().orElse(null);
    }
    public Symbol scopeAt(int offset) {
        return types.stream().filter(t -> t.bodyStart >= 0 && t.bodyStart <= offset && offset <= t.bodyEnd)
            .max(Comparator.comparingInt(t -> t.bodyStart)).orElse(null);
    }
    public List<Completion> completions(int offset, Collection<SprotoModel> documents) {
        String before = text.substring(0, offset), line = before.substring(before.lastIndexOf('\n') + 1);
        if (line.contains("#")) return List.of();
        Matcher prefixMatcher = Pattern.compile("[A-Za-z_0-9.]*$").matcher(before); prefixMatcher.find(); int start = prefixMatcher.start();
        Token previous = tokens.stream().filter(t -> t.end <= start && !t.kind.equals("eof")).reduce((a, b) -> b).orElse(null);
        Symbol owner = scopeAt(offset); String scope = owner == null ? "" : owner.fullName;
        Field field = types.stream().flatMap(t -> t.fields.stream()).filter(f -> f.modifier != null && f.modifier.start < offset && offset <= f.modifier.end).findFirst().orElse(null);
        if (previous != null && previous.kind.equals("(") || field != null) {
            Ref ref = field == null ? refs.stream().filter(r -> r.end <= start && text.substring(r.end, start).matches("[\\s(]*")).findFirst().orElse(null) : field.ref;
            if (ref == null) return List.of();
            if (ref.name.equals("integer")) return List.of("0", "2", "3", "6", "9").stream().map(n -> new Completion(n, "小数位数", "value", start)).toList();
            return resolve(ref, documents).stream().flatMap(t -> t.fields.stream()).filter(f -> BUILTINS.contains(f.ref.name))
                .map(f -> new Completion(f.name, f.ref.name, "field", start)).toList();
        }
        boolean protocolRef = previous != null && List.of("request", "response").contains(previous.value);
        if (previous != null && List.of(":", "*").contains(previous.kind) || protocolRef || refAt(start) != null) {
            List<Completion> result = new ArrayList<>(); Set<String> labels = new HashSet<>();
            for (String name : protocolRef ? List.of("nil") : BUILTINS) { result.add(new Completion(name, builtinDescription(name), "type", start)); labels.add(name); }
            Set<String> names = new LinkedHashSet<>(); for (SprotoModel d : documents) for (Symbol t : d.types) names.add(t.fullName);
            for (String name : names) {
                String alias = name;
                for (;;) {
                    List<Symbol> targets = resolve(new Ref(alias, scope, uri, start, offset, protocolRef), documents);
                    if (targets.size() == 1 && targets.getFirst().fullName.equals(name) && labels.add(alias)) result.add(new Completion(alias, name, "type", start));
                    int dot = alias.indexOf('.'); if (dot < 0) break; alias = alias.substring(dot + 1);
                }
            }
            return result;
        }
        if (owner == null && protocols.stream().anyMatch(p -> p.bodyStart <= offset && offset <= p.bodyEnd))
            return List.of(new Completion("request", "协议请求", "keyword", start), new Completion("response", "协议响应", "keyword", start));
        return List.of(new Completion("type", "定义类型：.Name { ... }", "template", start),
            owner == null ? new Completion("protocol", "定义协议：Name tag { ... }", "template", start) : new Completion("field", "定义字段：name tag : type", "template", start));
    }
    public static String builtinDescription(String name) {
        return switch (name) {
            case "integer" -> "64 位整数 / 64-bit integer；integer(n) 表示 n 位小数的定点数 / fixed-point value.";
            case "boolean" -> "布尔值 / Boolean."; case "string" -> "UTF-8 字符串 / UTF-8 string.";
            case "binary" -> "二进制数据 / Binary data."; case "double" -> "64 位浮点数 / 64-bit floating-point value.";
            case "nil" -> "协议不包含消息体 / No message body；response nil 表示仅确认 / confirmation only."; default -> "";
        };
    }
    public static String describe(Symbol symbol) {
        if (symbol instanceof Field f) return f.fullName + " " + f.tag + " : " + (f.array ? "*" : "") + f.ref.name + (f.modifier == null ? "" : "(" + f.modifier.value + ")");
        if (symbol.kind.equals("protocol")) return symbol.name + " " + symbol.tag + " { request / response }";
        StringBuilder result = new StringBuilder("." + symbol.fullName + " {\n");
        for (Field field : symbol.fields) result.append("  ").append(describe(field).substring(field.scope.length() + 1)).append('\n');
        return result.append('}').toString();
    }
}
