package dev.sproto;

import com.intellij.lang.*;
import com.intellij.lang.annotation.*;
import com.intellij.lang.documentation.AbstractDocumentationProvider;
import com.intellij.lexer.Lexer;
import com.intellij.lexer.LexerBase;
import com.intellij.openapi.editor.DefaultLanguageHighlighterColors;
import com.intellij.openapi.editor.colors.TextAttributesKey;
import com.intellij.openapi.fileTypes.*;
import com.intellij.openapi.options.colors.*;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.roots.ProjectRootManager;
import com.intellij.openapi.util.TextRange;
import com.intellij.openapi.util.IconLoader;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.psi.*;
import com.intellij.extapi.psi.ASTWrapperPsiElement;
import com.intellij.extapi.psi.PsiFileBase;
import com.intellij.psi.search.FileTypeIndex;
import com.intellij.psi.search.GlobalSearchScope;
import com.intellij.psi.tree.*;
import com.intellij.psi.util.*;
import com.intellij.codeInsight.completion.*;
import com.intellij.codeInsight.lookup.LookupElementBuilder;
import com.intellij.util.IncorrectOperationException;
import org.jetbrains.annotations.*;
import javax.swing.Icon;
import java.util.*;

/** IntelliJ frontend extensions; Rider uses its built-in JVM platform, no external runtime. */
public final class SprotoSupport {
    public static final Icon FILE_ICON = IconLoader.getIcon("/icons/sprotoFile.svg", SprotoSupport.class);
    public static final class SprotoLanguage extends Language {
        public static final SprotoLanguage INSTANCE = new SprotoLanguage();
        private SprotoLanguage() { super("Sproto"); }
    }
    public static final class SprotoFileType extends LanguageFileType {
        public static final SprotoFileType INSTANCE = new SprotoFileType();
        private SprotoFileType() { super(SprotoLanguage.INSTANCE); }
        @Override public @NotNull String getName() { return "Sproto"; }
        @Override public @NotNull String getDescription() { return "Sproto protocol schema"; }
        @Override public @NotNull String getDefaultExtension() { return "sproto"; }
        @Override public @Nullable Icon getIcon() { return FILE_ICON; }
    }
    public static final IElementType ID = new IElementType("IDENTIFIER", SprotoLanguage.INSTANCE);
    public static final IElementType TYPE_NAME = new IElementType("TYPE_NAME", SprotoLanguage.INSTANCE);
    public static final IElementType FIELD_NAME = new IElementType("FIELD_NAME", SprotoLanguage.INSTANCE);
    public static final IElementType PROTOCOL_NAME = new IElementType("PROTOCOL_NAME", SprotoLanguage.INSTANCE);
    public static final IElementType NUMBER = new IElementType("NUMBER", SprotoLanguage.INSTANCE);
    public static final IElementType COMMENT = new IElementType("COMMENT", SprotoLanguage.INSTANCE);
    public static final IElementType KEYWORD = new IElementType("KEYWORD", SprotoLanguage.INSTANCE);
    public static final IElementType BUILTIN = new IElementType("BUILTIN", SprotoLanguage.INSTANCE);
    public static final IElementType PUNCTUATION = new IElementType("PUNCTUATION", SprotoLanguage.INSTANCE);
    public static final IElementType BAD = new IElementType("BAD_CHARACTER", SprotoLanguage.INSTANCE);
    public static final IElementType SYMBOL = new IElementType("SYMBOL", SprotoLanguage.INSTANCE);
    public static final IFileElementType FILE = new IFileElementType(SprotoLanguage.INSTANCE);

    public static final class SprotoLexer extends LexerBase {
        private CharSequence buffer;
        private int bufferEnd, index;
        private List<SprotoModel.Token> tokens;
        private final boolean colorMode;
        private Map<Integer, IElementType> colors = Map.of();
        public SprotoLexer() { this(false); }
        public SprotoLexer(boolean colorMode) { this.colorMode = colorMode; }
        @Override public void start(@NotNull CharSequence buffer, int startOffset, int endOffset, int initialState) {
            this.buffer = buffer; this.bufferEnd = endOffset; index = 0;
            tokens = SprotoModel.tokenize(buffer.subSequence(startOffset, endOffset).toString()).stream()
                .map(t -> new SprotoModel.Token(t.value(), t.kind(), t.start() + startOffset, t.end() + startOffset)).toList();
            if (colorMode) {
                colors = new HashMap<>();
                // Parse the complete buffer so incremental lexer restarts retain the
                // distinction between a declaration, field and type reference.
                for (SprotoModel.Highlight h : new SprotoModel(buffer.toString(), "").highlight())
                    if (ROLE_TOKENS.containsKey(h.role())) colors.put(h.start(), ROLE_TOKENS.get(h.role()));
            }
        }
        @Override public int getState() { return 0; }
        @Override public @Nullable IElementType getTokenType() {
            if (index >= tokens.size()) return null;
            SprotoModel.Token t = tokens.get(index);
            if (colorMode && colors.containsKey(t.start())) return colors.get(t.start());
            return switch (t.kind()) {
                case "space" -> TokenType.WHITE_SPACE; case "comment" -> COMMENT; case "number" -> NUMBER;
                case "id" -> SprotoModel.BUILTINS.contains(t.value()) || t.value().equals("nil") ? BUILTIN :
                    List.of("request", "response").contains(t.value()) ? KEYWORD : ID;
                case ".", ":", "*", "{", "}", "(", ")" -> PUNCTUATION; default -> BAD;
            };
        }
        @Override public int getTokenStart() { return index < tokens.size() ? tokens.get(index).start() : bufferEnd; }
        @Override public int getTokenEnd() { return index < tokens.size() ? tokens.get(index).end() : bufferEnd; }
        @Override public void advance() { index++; }
        @Override public @NotNull CharSequence getBufferSequence() { return buffer; }
        @Override public int getBufferEnd() { return bufferEnd; }
    }
    public static final class SprotoFile extends PsiFileBase {
        public SprotoFile(FileViewProvider provider) { super(provider, SprotoLanguage.INSTANCE); }
        @Override public @NotNull FileType getFileType() { return SprotoFileType.INSTANCE; }
        @Override public String toString() { return "Sproto file"; }
    }
    public static final class SprotoParserDefinition implements ParserDefinition {
        @Override public @NotNull Lexer createLexer(Project project) { return new SprotoLexer(); }
        @Override public @NotNull PsiParser createParser(Project project) {
            // A lossless token PSI tree supports partially typed files. The tolerant semantic
            // parser is cached separately and supplies scoped definitions and diagnostics.
            return (root, builder) -> {
                PsiBuilder.Marker file = builder.mark();
                while (!builder.eof()) {
                    IElementType token = builder.getTokenType();
                    if (token == ID || token == BUILTIN || token == KEYWORD) {
                        PsiBuilder.Marker symbol = builder.mark(); builder.advanceLexer(); symbol.done(SYMBOL);
                    } else builder.advanceLexer();
                }
                file.done(root); return builder.getTreeBuilt();
            };
        }
        @Override public @NotNull IFileElementType getFileNodeType() { return FILE; }
        @Override public @NotNull TokenSet getWhitespaceTokens() { return TokenSet.create(TokenType.WHITE_SPACE); }
        @Override public @NotNull TokenSet getCommentTokens() { return TokenSet.create(COMMENT); }
        @Override public @NotNull TokenSet getStringLiteralElements() { return TokenSet.EMPTY; }
        @Override public @NotNull PsiElement createElement(ASTNode node) { return new SymbolElement(node); }
        @Override public @NotNull PsiFile createFile(@NotNull FileViewProvider provider) { return new SprotoFile(provider); }
    }
    public static final class SymbolElement extends ASTWrapperPsiElement implements PsiNamedElement {
        public SymbolElement(ASTNode node) { super(node); }
        @Override public String getName() { return getText(); }
        @Override public PsiElement setName(@NotNull String name) { throw new IncorrectOperationException("Sproto rename is not supported"); }
        @Override public @Nullable PsiReference getReference() {
            SprotoModel.Ref ref = model(getContainingFile()).refAt(getTextOffset());
            if (ref == null || ref.builtin()) return null;
            return new PsiPolyVariantReferenceBase<SymbolElement>(this, new TextRange(0, getTextLength()), false) {
                @Override public ResolveResult @NotNull [] multiResolve(boolean incompleteCode) {
                    List<ResolveResult> result = new ArrayList<>();
                    for (SprotoModel.Symbol target : SprotoModel.resolve(ref, models(getContainingFile()))) {
                        PsiElement destination = destination(getContainingFile(), target);
                        if (destination != null) result.add(new PsiElementResolveResult(destination));
                    }
                    return result.toArray(ResolveResult.EMPTY_ARRAY);
                }
                @Override public Object @NotNull [] getVariants() { return new Object[0]; }
                @Override public PsiElement handleElementRename(@NotNull String name) { throw new IncorrectOperationException("Sproto rename is not supported"); }
            };
        }
        @Override public PsiReference @NotNull [] getReferences() {
            PsiReference reference = getReference(); return reference == null ? PsiReference.EMPTY_ARRAY : new PsiReference[]{reference};
        }
    }
    private static String uri(PsiFile file) {
        VirtualFile v = file.getOriginalFile().getVirtualFile();
        return v == null ? file.getName() : v.getUrl();
    }
    public static SprotoModel model(PsiFile file) {
        return CachedValuesManager.getCachedValue(file, () -> CachedValueProvider.Result.create(new SprotoModel(file.getText(), uri(file)), file));
    }
    public static Collection<SprotoModel> models(PsiFile current) {
        Project project = current.getProject();
        Collection<SprotoModel> cached = CachedValuesManager.getManager(project).getCachedValue(project, () -> {
            List<SprotoModel> result = new ArrayList<>();
            for (VirtualFile v : FileTypeIndex.getFiles(SprotoFileType.INSTANCE, GlobalSearchScope.projectScope(project))) {
                PsiFile f = PsiManager.getInstance(project).findFile(v);
                if (f != null) result.add(model(f));
            }
            return CachedValueProvider.Result.create(result, PsiModificationTracker.MODIFICATION_COUNT, ProjectRootManager.getInstance(project));
        });
        List<SprotoModel> result = new ArrayList<>(cached.stream().filter(m -> !m.uri.equals(uri(current))).toList());
        result.add(model(current)); return result;
    }
    private static PsiElement destination(PsiFile current, SprotoModel.Symbol target) {
        PsiFile file = current;
        if (!uri(current).equals(target.uri)) {
            for (VirtualFile v : FileTypeIndex.getFiles(SprotoFileType.INSTANCE, GlobalSearchScope.projectScope(current.getProject()))) {
                if (v.getUrl().equals(target.uri)) { file = PsiManager.getInstance(current.getProject()).findFile(v); break; }
            }
        }
        if (file == null || !uri(file).equals(target.uri)) return null;
        PsiElement leaf = file.findElementAt(target.start);
        return leaf == null ? null : leaf.getParent();
    }
    private static TextAttributesKey attributes(String name, TextAttributesKey fallback) {
        return TextAttributesKey.createTextAttributesKey("SPROTO_" + name, fallback);
    }
    public static final Map<String, TextAttributesKey> ROLE_COLORS = createRoleColors();
    public static final Map<String, IElementType> ROLE_TOKENS = createRoleTokens();
    private static Map<String, TextAttributesKey> createRoleColors() {
        Map<String, TextAttributesKey> result = new LinkedHashMap<>();
        for (String role : List.of("typeDeclaration", "typeReference", "fieldDeclaration", "fieldReference", "protocolDeclaration",
            "integer", "boolean", "string", "binary", "double", "nil", "request", "response", "fieldTag", "protocolTag", "precision",
            "number", "comment", "typeMarker", "typeSeparator", "fieldSeparator", "array", "braces", "parentheses")) {
            TextAttributesKey fallback = switch (role) {
                case "typeDeclaration", "typeReference" -> DefaultLanguageHighlighterColors.CLASS_NAME;
                case "fieldDeclaration", "fieldReference" -> DefaultLanguageHighlighterColors.INSTANCE_FIELD;
                case "protocolDeclaration" -> DefaultLanguageHighlighterColors.FUNCTION_DECLARATION;
                case "fieldTag", "protocolTag", "precision", "number" -> DefaultLanguageHighlighterColors.NUMBER;
                case "comment" -> DefaultLanguageHighlighterColors.LINE_COMMENT;
                case "braces" -> DefaultLanguageHighlighterColors.BRACES;
                case "parentheses" -> DefaultLanguageHighlighterColors.PARENTHESES;
                case "typeMarker", "typeSeparator" -> DefaultLanguageHighlighterColors.DOT;
                case "fieldSeparator", "array" -> DefaultLanguageHighlighterColors.OPERATION_SIGN;
                default -> DefaultLanguageHighlighterColors.KEYWORD;
            };
            String name = role.replaceAll("([a-z])([A-Z])", "$1_$2").toUpperCase(Locale.ROOT);
            result.put(role, attributes(name, fallback));
        }
        return Collections.unmodifiableMap(result);
    }
    private static Map<String, IElementType> createRoleTokens() {
        Map<String, IElementType> result = new LinkedHashMap<>();
        for (String role : ROLE_COLORS.keySet()) result.put(role, switch (role) {
            case "typeDeclaration" -> TYPE_NAME; case "fieldDeclaration" -> FIELD_NAME; case "protocolDeclaration" -> PROTOCOL_NAME;
            default -> new IElementType("COLOR_" + role, SprotoLanguage.INSTANCE);
        });
        return Collections.unmodifiableMap(result);
    }
    public static final class Highlighter extends SyntaxHighlighterBase {
        private static final TextAttributesKey COMMENTS = attributes("COMMENT", DefaultLanguageHighlighterColors.LINE_COMMENT);
        private static final TextAttributesKey NUMBERS = attributes("NUMBER", DefaultLanguageHighlighterColors.NUMBER);
        private static final TextAttributesKey KEYWORDS = attributes("KEYWORD", DefaultLanguageHighlighterColors.KEYWORD);
        private static final TextAttributesKey TYPES = attributes("BUILTIN", DefaultLanguageHighlighterColors.KEYWORD);
        private static final TextAttributesKey PUNCT = attributes("PUNCTUATION", DefaultLanguageHighlighterColors.BRACES);
        @Override public @NotNull Lexer getHighlightingLexer() { return new SprotoLexer(true); }
        @Override public TextAttributesKey @NotNull [] getTokenHighlights(IElementType type) {
            for (Map.Entry<String, IElementType> entry : ROLE_TOKENS.entrySet()) if (entry.getValue() == type) return pack(ROLE_COLORS.get(entry.getKey()));
            if (type == COMMENT) return pack(COMMENTS);
            if (type == NUMBER) return pack(NUMBERS);
            if (type == KEYWORD) return pack(KEYWORDS);
            if (type == BUILTIN) return pack(TYPES);
            if (type == PUNCTUATION) return pack(PUNCT);
            return EMPTY;
        }
    }
    public static final class HighlighterFactory extends SyntaxHighlighterFactory {
        @Override public @NotNull SyntaxHighlighter getSyntaxHighlighter(@Nullable Project project, @Nullable VirtualFile file) { return new Highlighter(); }
    }
    public static final class SprotoColorSettings implements ColorSettingsPage {
        @Override public @Nullable Icon getIcon() { return FILE_ICON; }
        @Override public @NotNull SyntaxHighlighter getHighlighter() { return new Highlighter(); }
        @Override public @NotNull String getDemoText() {
            return "# Sproto protocol schema\n.Player {\n    .Item { id 0 : integer }\n    id 0 : integer(3)\n    name 1 : string\n    raw 2 : binary\n    weight 3 : double\n    friend 4 : Player\n    items 5 : *Player.Item(id)\n}\nLogin 1 {\n    request Player\n    response { ok 0 : boolean }\n}\nPing 2 { response nil }";
        }
        @Override public @Nullable Map<String, TextAttributesKey> getAdditionalHighlightingTagToDescriptorMap() { return null; }
        @Override public AttributesDescriptor @NotNull [] getAttributeDescriptors() {
            return ROLE_COLORS.entrySet().stream().map(e -> new AttributesDescriptor(switch (e.getKey()) {
                case "typeDeclaration" -> "类型 / Type // 声明 / Declaration"; case "typeReference" -> "类型 / Type // 引用 / Reference";
                case "fieldDeclaration" -> "字段 / Field // 声明 / Declaration"; case "fieldReference" -> "字段 / Field // 引用 / Reference / 字典键 / Dictionary key";
                case "protocolDeclaration" -> "协议 / Protocol // 方法声明 / Method declaration";
                case "request", "response" -> "关键字 / Keyword // " + e.getKey();
                case "integer", "boolean", "string", "binary", "double", "nil" -> "内置类型 / Built-in type // " + e.getKey();
                case "fieldTag" -> "数字 / Number // 字段编号 / Field tag"; case "protocolTag" -> "数字 / Number // 协议编号 / Protocol tag";
                case "precision" -> "数字 / Number // 小数精度 / Precision"; case "number" -> "数字 / Number // 其他数字 / Other numbers";
                case "comment" -> "注释 / Comment // 行注释 / Line comment"; case "typeMarker" -> "符号 / Symbol // 类型声明点号 / Type marker";
                case "typeSeparator" -> "符号 / Symbol // 限定类型点号 / Type separator"; case "fieldSeparator" -> "符号 / Symbol // 字段冒号 / Field separator";
                case "array" -> "符号 / Symbol // 数组星号 / Array marker"; case "braces" -> "符号 / Symbol // 大括号 / Braces"; case "parentheses" -> "符号 / Symbol // 圆括号 / Parentheses";
                default -> e.getKey();
            }, e.getValue())).toArray(AttributesDescriptor[]::new);
        }
        @Override public ColorDescriptor @NotNull [] getColorDescriptors() { return ColorDescriptor.EMPTY_ARRAY; }
        @Override public @NotNull String getDisplayName() { return "Sproto"; }
    }
    public static final class SprotoAnnotator implements Annotator {
        @Override public void annotate(@NotNull PsiElement element, @NotNull AnnotationHolder holder) {
            if (!(element instanceof SprotoFile file)) return;
            SprotoModel m = model(file);
            for (SprotoModel.Issue issue : m.validate(models(file))) {
                int start = Math.min(issue.start(), file.getTextLength());
                int end = Math.min(file.getTextLength(), Math.max(issue.end(), start + 1));
                if (end == start && start > 0) start--;
                holder.newAnnotation(HighlightSeverity.ERROR, issue.message()).range(new TextRange(start, end)).create();
            }
        }
    }
    public static final class SprotoCompletion extends CompletionContributor {
        @Override public void beforeCompletion(@NotNull CompletionInitializationContext context) {
            int offset = context.getEditor().getCaretModel().getOffset();
            CharSequence text = context.getEditor().getDocument().getCharsSequence();
            int start = offset;
            while (start > 0) {
                char c = text.charAt(start - 1);
                if (!(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '.')) break;
                start--;
            }
            context.getOffsetMap().addOffset(CompletionInitializationContext.START_OFFSET, start);
        }
        @Override public void fillCompletionVariants(@NotNull CompletionParameters parameters, @NotNull CompletionResultSet result) {
            PsiFile file = parameters.getOriginalFile(); if (!(file instanceof SprotoFile)) return;
            SprotoModel m = model(file); int offset = Math.min(parameters.getOffset(), m.text.length());
            for (SprotoModel.Completion c : m.completions(offset, models(file))) {
                LookupElementBuilder item = LookupElementBuilder.create(c.label()).withTypeText(c.detail(), true);
                if (c.kind().equals("template")) item = item.withInsertHandler((context, lookup) -> {
                    String text = switch (c.label()) {
                        case "type" -> ".TypeName {\n    field 0 : integer\n}";
                        case "field" -> "field 0 : integer";
                        default -> "ProtocolName 1 {\n    request {\n    }\n    response nil\n}";
                    };
                    context.getDocument().replaceString(context.getStartOffset(), context.getTailOffset(), text);
                    context.getEditor().getCaretModel().moveToOffset(context.getStartOffset() + text.length());
                });
                result.withPrefixMatcher(m.text.substring(c.start(), offset)).addElement(item);
            }
        }
    }
    public static final class SprotoDocumentation extends AbstractDocumentationProvider {
        @Override public @Nullable String generateDoc(PsiElement element, @Nullable PsiElement originalElement) {
            if (element == null || !(element.getContainingFile() instanceof SprotoFile file)) return null;
            SprotoModel m = model(file); int offset = element.getTextOffset();
            SprotoModel.Ref ref = m.refAt(offset); SprotoModel.Symbol symbol = m.symbolAt(offset);
            String text;
            if (ref != null && ref.builtin()) text = SprotoModel.builtinDescription(ref.name);
            else {
                if (symbol == null && ref != null) symbol = SprotoModel.resolve(ref, models(file)).stream().findFirst().orElse(null);
                if (symbol == null) return null; text = SprotoModel.describe(symbol);
            }
            return "<pre>" + text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;") + "</pre>";
        }
        @Override public @Nullable String getQuickNavigateInfo(PsiElement element, PsiElement originalElement) { return generateDoc(element, originalElement); }
    }
    public static final class SprotoCommenter implements Commenter {
        @Override public String getLineCommentPrefix() { return "#"; }
        @Override public String getBlockCommentPrefix() { return null; }
        @Override public String getBlockCommentSuffix() { return null; }
        @Override public String getCommentedBlockCommentPrefix() { return null; }
        @Override public String getCommentedBlockCommentSuffix() { return null; }
    }
}
