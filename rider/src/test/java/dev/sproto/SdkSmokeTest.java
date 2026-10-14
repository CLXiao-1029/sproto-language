package dev.sproto;

import com.intellij.psi.tree.IElementType;
import com.intellij.openapi.fileTypes.SyntaxHighlighter;
import java.nio.file.*;
import java.util.*;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.*;

/** Checks SDK linkage, XML extension constructors and highlighting lexer contracts. */
public final class SdkSmokeTest {
    public static void main(String[] args) throws Exception {
        Document descriptor = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(Path.of(args[0]).toFile());
        Path resources = Path.of(args[0]).getParent().getParent();
        Element smallIcon = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(resources.resolve("icons/sprotoFile.svg").toFile()).getDocumentElement();
        Element pluginIcon = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(resources.resolve("META-INF/pluginIcon.svg").toFile()).getDocumentElement();
        if (!smallIcon.getAttribute("width").equals("16") || !smallIcon.getAttribute("height").equals("16")) throw new AssertionError("file icon must be 16x16");
        if (!pluginIcon.getAttribute("width").equals("40") || !pluginIcon.getAttribute("height").equals("40")) throw new AssertionError("plugin icon must remain 40x40");
        if (SprotoSupport.SprotoFileType.INSTANCE.getIcon() != SprotoSupport.FILE_ICON) throw new AssertionError("file type must use the small icon");
        NodeList extensions = descriptor.getElementsByTagName("extensions").item(0).getChildNodes();
        int count = 0;
        for (int i = 0; i < extensions.getLength(); i++) {
            if (!(extensions.item(i) instanceof Element e)) continue;
            if (e.getTagName().equals("additionalTextAttributes")) {
                Path palette = Path.of(args[0]).getParent().getParent().resolve(e.getAttribute("file"));
                Document colors = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(palette.toFile());
                Map<String, String> values = new HashMap<>();
                NodeList options = colors.getDocumentElement().getChildNodes();
                for (int j = 0; j < options.getLength(); j++) if (options.item(j) instanceof Element option) {
                    NodeList attributes = option.getElementsByTagName("option");
                    for (int k = 0; k < attributes.getLength(); k++) if (((Element)attributes.item(k)).getAttribute("name").equals("FOREGROUND"))
                        values.put(option.getAttribute("name"), ((Element)attributes.item(k)).getAttribute("value"));
                }
                if (new HashSet<>(List.of(values.get("SPROTO_TYPE_DECLARATION"), values.get("SPROTO_FIELD_DECLARATION"), values.get("SPROTO_PROTOCOL_DECLARATION"))).size() != 3)
                    throw new AssertionError("type, field and protocol colors must differ");
                if (!"FFFFFF".equals(values.get("SPROTO_FIELD_DECLARATION")) || !"FFFFFF".equals(values.get("SPROTO_FIELD_REFERENCE"))) throw new AssertionError("field defaults");
                if (!"569CD6".equals(values.get("SPROTO_INTEGER"))) throw new AssertionError("builtin defaults");
                for (String key : List.of("SPROTO_FIELD_TAG", "SPROTO_PROTOCOL_TAG", "SPROTO_PRECISION", "SPROTO_NUMBER"))
                    if (values.containsKey(key)) throw new AssertionError("numeric color must inherit theme: " + key);
                continue;
            }
            Class<?> implementation = Class.forName(e.getAttribute(e.hasAttribute("implementationClass") ? "implementationClass" : "implementation"));
            if (e.hasAttribute("fieldName")) implementation.getField(e.getAttribute("fieldName")).get(null);
            else implementation.getConstructor().newInstance();
            count++;
        }
        String text = "# 中文😀\r\n.A { x 0 : *integer(3) }\nfoo 1 { response nil }";
        SprotoSupport.SprotoLexer lexer = new SprotoSupport.SprotoLexer(); lexer.start(text);
        SyntaxHighlighter highlighter = new SprotoSupport.Highlighter();
        int offset = 0, tokens = 0;
        while (lexer.getTokenType() != null) {
            IElementType type = lexer.getTokenType();
            if (lexer.getTokenStart() != offset || lexer.getTokenEnd() <= offset) throw new AssertionError("lexer source coverage");
            if (type == SprotoSupport.BAD) throw new AssertionError("unexpected invalid token");
            highlighter.getTokenHighlights(type);
            int next = lexer.getTokenEnd();
            SprotoSupport.SprotoLexer resumed = new SprotoSupport.SprotoLexer(); resumed.start(text, offset, text.length(), lexer.getState());
            if (resumed.getTokenType() != type || resumed.getTokenEnd() != next) throw new AssertionError("lexer restart");
            offset = next; tokens++; lexer.advance();
        }
        if (offset != text.length() || count != 8) throw new AssertionError("coverage or descriptor count");
        SprotoSupport.SprotoLexer coloring = new SprotoSupport.SprotoLexer(true); coloring.start(text);
        Set<IElementType> roles = new HashSet<>();
        while (coloring.getTokenType() != null) {
            IElementType role = coloring.getTokenType(); roles.add(role);
            if (List.of(SprotoSupport.TYPE_NAME, SprotoSupport.FIELD_NAME, SprotoSupport.PROTOCOL_NAME).contains(role) && highlighter.getTokenHighlights(role).length == 0)
                throw new AssertionError("missing role color");
            SprotoSupport.SprotoLexer resumed = new SprotoSupport.SprotoLexer(true);
            resumed.start(text, coloring.getTokenStart(), text.length(), coloring.getState());
            if (resumed.getTokenType() != role) throw new AssertionError("color lost on incremental restart");
            coloring.advance();
        }
        if (!roles.containsAll(List.of(SprotoSupport.TYPE_NAME, SprotoSupport.FIELD_NAME, SprotoSupport.PROTOCOL_NAME))) throw new AssertionError("missing classified roles");
        for (String role : SprotoSupport.ROLE_COLORS.keySet())
            if (highlighter.getTokenHighlights(SprotoSupport.ROLE_TOKENS.get(role))[0] != SprotoSupport.ROLE_COLORS.get(role)) throw new AssertionError("settings role mapping: " + role);
        if (SprotoSupport.ROLE_COLORS.get("typeDeclaration") == SprotoSupport.ROLE_COLORS.get("typeReference") ||
            SprotoSupport.ROLE_COLORS.get("fieldDeclaration") == SprotoSupport.ROLE_COLORS.get("fieldReference")) throw new AssertionError("declarations and references must be separately configurable");
        System.out.println("Rider SDK smoke: " + count + " extensions loaded; " + tokens + " lexer tokens checked");
    }
}
