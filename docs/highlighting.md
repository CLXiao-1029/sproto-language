# Sproto 颜色配置（1.0.1）

高亮分类与颜色设置分开：插件识别每个语法角色，编辑器原生颜色设置决定其样式。无需修改插件代码或重新打包。类型声明和引用、字段声明和字典键引用现在有独立的配置项，即使默认颜色相同，也可以分别覆盖。

## 默认值与恢复默认

| 角色 | 默认处理 |
| --- | --- |
| 类型声明、类型引用 | 青绿色；可分别设置 |
| 字段声明、字段引用（字典键） | 白色 `#FFFFFF`；可分别设置 |
| 协议方法声明 | VS Code 与 Rider 默认浅黄色 `#DCDCAA` |
| integer / boolean / string / binary / double / nil | VS Code 蓝色 `#569CD6`；每项均可分别设置 |
| 字段编号、协议编号、小数精度、其他数字 | 使用当前主题的数字颜色，不设置固定值 |
| request / response、注释、点号、冒号、星号、括号 | 使用当前主题，均可分别设置 |

删除自己添加的颜色规则，即恢复对应的插件或主题默认值。默认白色是明确的 `#FFFFFF`，切换到浅色主题时可在该主题的配置中改为深色。插件不会修改用户设置文件；用户级、工作区和主题配置由编辑器管理。

## VS Code 设置

### 推荐：图形界面

1. 打开 VS Code 设置（Ctrl+,），搜索 **Sproto**，或运行 **Sproto: 打开设置**。每类颜色都有单独输入项，接受 `#RRGGBB` / `#RRGGBBAA`，留空使用原生默认配色。
2. 运行 **Sproto: 配置高亮颜色** 打开颜色面板。每行都有颜色选择器、十六进制输入和“继承”选项。
3. 选择保存范围：**用户**、**工作区**或**当前文件夹**。文件夹以打开面板时的活动编辑器所属文件夹为准；没有活动文件时使用工作区第一个文件夹。
4. 修改后点击 **保存颜色**，编辑器自动刷新。**全部继承** 会清空面板中当前范围的选择，点击保存后移除该范围的覆盖；其他范围的配置保持不变。

这些设置保存在同一套 `sproto.colors.*` 配置中，GUI 和 JSON 可以互相修改。比如：

```json
{
  "sproto.colors.typeDeclaration": "#4EC9B0",
  "sproto.colors.typeReference": "#00BFA5",
  "sproto.colors.fieldDeclaration": "#FFFFFF",
  "sproto.colors.fieldReference": "#9CDCFE"
}
```

完整属性名为 `sproto.colors.` 加下表第三列的标识（例如 `fieldTag`、`integer`、`comment`）。该表原来用于 Rider 的角色标识现在同样用于 VS Code 的 GUI 设置。

显式的 `sproto.colors.*` 颜色优先于 `editor.semanticTokenColorCustomizations` 和 TextMate 配色；不指定时仍遵循这些原生规则。GUI 中“继承”会删除当前范围的设置，随后可继承用户/工作区的上级覆盖。直接在 JSON 中写空字符串表示该范围使用原生默认配色；如果希望继承上级 `sproto.colors.*`，删除该 JSON 属性即可。

### 原生 JSON 颜色规则

打开命令面板，运行 **Preferences: Open User Settings (JSON)**。也可以在工作区 `.vscode/settings.json` 中配置，只影响该项目。把以下内容合并进现有的 `editor.semanticTokenColorCustomizations.rules`；不要创建重复的同名顶层配置项。

```jsonc
{
  "editor.semanticTokenColorCustomizations": {
    "rules": {
      "sprotoType.declaration:sproto": "#4EC9B0", // 类型声明 .Player
      "sprotoType.reference:sproto": "#00BFA5",   // 类型引用 : Player
      "sprotoField.declaration:sproto": "#FFFFFF", // 字段声明 id 0 : ...
      "sprotoField.reference:sproto": "#9CDCFE",   // 字典键引用 *Player(id)
      "sprotoProtocol.declaration:sproto": { "foreground": "#DCDCAA", "bold": true },
      "sprotoBuiltin:sproto": "#569CD6",          // 所有内置类型的公共值
      "sprotoBuiltin.string:sproto": "#CE9178",   // 仅 string；覆盖上面的公共值
      "keyword.request:sproto": "#C586C0",
      "keyword.response:sproto": "#D19ACB",
      "comment:sproto": { "foreground": "#6A9955", "italic": true }
      // 不配置 number：数字继承当前主题
    }
  }
}
```

保存设置后即可刷新。颜色既可以写成十六进制字符串，也可以写成样式对象，例如 `{ "foreground": "#4EC9B0", "bold": true, "italic": true, "underline": false }`。公共规则（例如 `sprotoType:sproto`）影响该类的声明与引用；更具体的规则分别覆盖它。

### 所有可配置角色

| VS Code 选择器 | 作用位置 | 对应 Rider 设置项 |
| --- | --- | --- |
| `sprotoType.declaration:sproto` | 类型声明 `.Player` 中的 Player，包括嵌套类型 | `typeDeclaration` |
| `sprotoType.reference:sproto` | 字段/消息类型引用，包括限定名称的各段 | `typeReference` |
| `sprotoField.declaration:sproto` | 字段声明中的字段名 | `fieldDeclaration` |
| `sprotoField.reference:sproto` | 数组字典索引中引用的字段名，如 `*Player(id)` 中的 id | `fieldReference` |
| `sprotoProtocol.declaration:sproto` | 协议方法名，例如 `Login 1 { ... }` 中的 Login | `protocolDeclaration` |
| `sprotoBuiltin.integer:sproto` | integer 类型 | `integer` |
| `sprotoBuiltin.boolean:sproto` | boolean 类型 | `boolean` |
| `sprotoBuiltin.string:sproto` | string 类型 | `string` |
| `sprotoBuiltin.binary:sproto` | binary 类型 | `binary` |
| `sprotoBuiltin.double:sproto` | double 类型 | `double` |
| `sprotoBuiltin.nil:sproto` | request/response 后的 nil | `nil` |
| `keyword.request:sproto` | request 消息关键字 | `request` |
| `keyword.response:sproto` | response 消息关键字 | `response` |
| `number.fieldTag:sproto` | 字段编号 | `fieldTag` |
| `number.protocolTag:sproto` | 协议编号 | `protocolTag` |
| `number.precision:sproto` | integer(3) 中的小数精度 3 | `precision` |
| `number:sproto` | 所有数字的公共规则；未单独设置的数字继承它 | `number`（Rider 各项独立继承主题的 Number） |
| `comment:sproto` | # 行注释 | `comment` |
| `sprotoPunctuation.typeMarker:sproto` | 类型声明前的点号 | `typeMarker` |
| `sprotoPunctuation.typeSeparator:sproto` | 限定名称中的点号，例如 Player.Item | `typeSeparator` |
| `sprotoPunctuation.fieldSeparator:sproto` | 字段类型前的冒号 | `fieldSeparator` |
| `sprotoPunctuation.array:sproto` | 数组星号 * | `array` |
| `sprotoPunctuation.braces:sproto` | { 和 } | `braces` |
| `sprotoPunctuation.parentheses:sproto` | ( 和 ) | `parentheses` |
| `variable:sproto` | 未完成/未识别的标识符 | 继承主题标识符颜色 |

Sproto schema 中只声明协议方法，没有方法调用语法，因此这里不提供不存在的“协议方法调用”角色。字段名即使叫 request、string 或 integer，也按字段声明着色。

如需单独给数字着色，只需添加相应规则，例如：

```jsonc
"number.fieldTag:sproto": "#B5CEA8",
"number.protocolTag:sproto": "#D7BA7D",
"number.precision:sproto": "#F78C6C"
```

没有添加这些规则时，三者都继承当前主题的数字配色。

### 按主题覆盖

在原生设置里也可以使用主题限定配置，主题名称需与 VS Code 显示的名称一致：

```jsonc
"editor.semanticTokenColorCustomizations": {
  "[Default Light Modern]": {
    "rules": {
      "sprotoField.declaration:sproto": "#202020",
      "sprotoField.reference:sproto": "#202020"
    }
  }
}
```

使用 **Developer: Inspect Editor Tokens and Scopes** 可以查看光标所在标识符的 semantic token type、modifiers 与实际生效的颜色来源。默认启用 Sproto 的语义高亮；如用户曾显式禁用它，可设置 `"[sproto]": { "editor.semanticHighlighting.enabled": true }`。

### TextMate 回退

关闭语义高亮时，可使用 `editor.tokenColorCustomizations.textMateRules` 配置词法颜色。类型的 scopes 为 `entity.name.type.declaration.sproto` / `entity.name.type.reference.sproto`，字段的 scopes 为 `variable.other.member.declaration.sproto` / `variable.other.member.reference.sproto`。例如：

```jsonc
"editor.tokenColorCustomizations": {
  "textMateRules": [
    { "scope": "source.sproto entity.name.type.declaration.sproto", "settings": { "foreground": "#4EC9B0" } },
    { "scope": "source.sproto entity.name.type.reference.sproto", "settings": { "foreground": "#00BFA5" } }
  ]
}
```

正常启用语义高亮时，应优先使用语义规则，以确保多行声明、未完成语法及类型定位后的分类准确。配置格式遵循 [VS Code 语义高亮规则](https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide)。

## Rider 设置

打开 **Settings → Editor → Color Scheme → Sproto**，页面按类型、字段、协议、内置类型、数字、关键字、注释和符号中文分组，声明与引用分别列出。上表的标识用于对应这些角色。选择项目后设置 Foreground、字体样式，点击 Apply；需要时复制当前方案作为个人方案。

声明与引用使用不同的属性键，修改其中一项不会覆盖另一项。数字角色没有预设颜色，默认继承 **Language Defaults → Number**。要单独覆盖某项数字的颜色，取消该项的继承选项并设置 Foreground；要恢复主题默认，再启用继承。字段和内置类型也可以取消其颜色覆盖并恢复对应的 Language Defaults。

浅色 Default、深色 Darcula 及派生方案包含插件的默认颜色；其他第三方方案可以在同一页面自行调整。词法高亮直接使用这些设置项，语法检查不会再用通用颜色覆盖声明/引用的配置。
