package dev.sproto;

import java.nio.file.*;
import java.util.*;

public final class ModelTest {
    private static int checks;
    private static void check(boolean condition, String message) { checks++; if (!condition) throw new AssertionError(message); }
    private static SprotoModel parse(String text) { return new SprotoModel(text, "a"); }
    private static List<String> complete(String text) {
        SprotoModel m = parse(text); return m.completions(text.indexOf('|'), List.of(m)).stream().map(SprotoModel.Completion::label).toList();
    }
    public static void main(String[] args) throws Exception {
        SprotoModel real = parse(Files.readString(Path.of(args[0])));
        check(real.types.size() > 100 && real.protocols.size() > 100, "real schema size");
        check(real.validate(List.of(real)).isEmpty(), "real schema: " + real.validate(List.of(real)));
        SprotoModel nested = parse(".Outer { .Inner { next 0 : Inner } a 0 : Inner b 1 : Global } .Global { a 0 : Outer.Inner } foo 1 { request Outer response { a 0 : Global } }");
        check(nested.validate(List.of(nested)).isEmpty(), "nested types and protocol bodies");
        check(SprotoModel.resolve(nested.refs.getFirst(), List.of(nested)).getFirst().fullName.equals("Outer.Inner"), "scope resolution");
        SprotoModel a = parse(".A { f 0 : B }"), b = new SprotoModel(".B {}", "b"), c = new SprotoModel(".B {}", "c");
        check(SprotoModel.resolve(a.refs.getFirst(), List.of(a, b)).getFirst().uri.equals("b"), "cross-file resolution");
        check(a.validate(List.of(a, b, c)).stream().anyMatch(i -> i.message().contains("多个定义")), "ambiguous type");
        SprotoModel local = parse(".B {} .A { f 0 : B }");
        check(SprotoModel.resolve(local.refs.getFirst(), List.of(local, b, c)).getFirst().uri.equals("a"), "same file precedence");
        SprotoModel maps = parse(".KV { key 0 : integer value 1 : string } .A { a 0 : *KV() b 1 : *KV(key) c 2 : integer(3) d 3 : *integer(2) e 4 : binary f 5 : double } p 1 { request nil response nil }");
        check(maps.validate(List.of(maps)).isEmpty(), "maps and builtins");
        SprotoModel bad = parse(".KV { k 0 : Missing } .A { a 0 : *KV(missing) b 1 : string(3) c 2 : integer(foo) d 3 : KV(k) e 4 : *integer() f 5 : nil }");
        check(bad.validate(List.of(bad)).size() >= 7, "invalid types, maps and precision");
        SprotoModel malformed = parse(".A {\n a 0 integer\n b 1 : Unknown\n b 1 : string\n}\n.A {}\np 1 { request {} request {} }\nq 1 {}");
        for (String match : List.of("需要“:”", "未定义", "重复的字段：", "重复的字段编号", "重复的类型", "重复的 request", "重复的协议编号"))
            check(malformed.validate(List.of(malformed)).stream().anyMatch(i -> i.message().contains(match)), match);
        for (String text : List.of("}", ". {", ".A { x 0 :", ".A { x 0 : Foo. }", "p 0 { wrong }", "@", ".A { x 0 : *")) check(!parse(text).issues.isEmpty(), "recover " + text);
        check(complete(".A { .Inner {} x 0 : | }").contains("Inner"), "nested completion");
        check(complete(".A {} .B { x 0 : A| }").contains("A"), "type prefix");
        check(complete(".A { .Inner {} } .B { x 0 : A.| }").contains("A.Inner"), "qualified completion");
        check(complete(".A { key 0 : integer } .B { x 0 : *A(|) }").equals(List.of("key")), "dictionary key completion");
        check(complete(".A { x 0 : integer(|) }").contains("3"), "precision completion");
        check(complete("p 0 { request | }").contains("nil") && !complete("p 0 { request | }").contains("integer"), "protocol completion");
        check(complete("# comment |").isEmpty(), "comments suppressed");
        String unicode = "# 中文😀\r\n.A {}\r\n.B { a 0 : A }";
        check(parse(unicode).refs.getFirst().start == unicode.lastIndexOf('A'), "UTF-16 offsets");
        SprotoModel fieldBeforeType = parse(".A { f 0 : string\n .B {}\n b 1 : B }");
        check(fieldBeforeType.validate(List.of(fieldBeforeType)).isEmpty(), "nested declaration after field");
        check(!parse(". A {}").issues.isEmpty(), "type declaration dot whitespace");
        SprotoModel colored = parse(".A { x 7 : integer(3) a 8 : *A(x) } Call 23 { request A response nil } # 中文");
        Set<String> colorRoles = new HashSet<>(); colored.highlight().forEach(h -> colorRoles.add(h.role()));
        for (String role : List.of("typeDeclaration", "typeReference", "fieldDeclaration", "fieldReference", "protocolDeclaration", "integer", "nil",
            "request", "response", "fieldTag", "protocolTag", "precision", "comment", "typeMarker", "fieldSeparator", "array", "braces", "parentheses"))
            check(colorRoles.contains(role), "color category " + role);
        System.out.println("Rider model: " + checks + " checks passed");
    }
}
