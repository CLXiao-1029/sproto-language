# Sproto Language for Visual Studio Code

<img src="./images/logo.png" alt="SProto logo" width="480" />

作者：**Yexiao**。

扩展标识 / Extension ID：`Yexiao.sproto-language-yexiao`。

The extension provides bilingual Chinese/English labels, settings descriptions, color-panel controls, completion details and diagnostics. / 本插件的标签、设置说明、颜色面板、补全详情和诊断提示均提供中英文文本。

## 功能

- Sproto 语法与语义高亮，独立区分类型声明/引用、字段声明/字典键引用、协议方法、内置类型、数字、注释和符号。
- 在设置面板中搜索 **Sproto** 调整各类颜色；命令 **Sproto: 配置高亮颜色** 提供颜色选择器、十六进制输入和恢复继承选项。保留 `settings.json` 配置方式。
- 字段默认白色，内置类型默认 VS Code 蓝色，协议方法名默认浅黄色 `#DCDCAA`；未指定数字颜色时使用主题默认值。
- 类型定义跳转，支持嵌套、限定名称和同一工作区文件夹中的跨文件引用。
- 上下文补全、类型与字段悬停说明，以及类型、字段、协议模板。
- 语法/类型诊断：未知或歧义类型、重复声明/编号、字典索引及小数精度错误。
- Outline 文件符号列表及行注释切换。
- 支持数组、字典、定点整数、内联 request/response 消息体与 response nil。

### 使用图形化颜色面板

1. 在 VS Code 中打开要查看效果的 `.sproto` 文件。
2. 按 **Ctrl+Shift+P**（macOS：**Cmd+Shift+P**）打开命令面板，也可以点击菜单 **查看 → 命令面板**。
3. 输入 **Sproto**，选择 **Sproto: 配置高亮颜色**，按 Enter。编辑器会打开名为 **Sproto 高亮颜色** 的配置页面。
4. 在页面顶部选择 **保存范围**：

   | 范围 | 生效范围 |
   | --- | --- |
   | 用户 | 当前 VS Code 用户配置中的所有项目 |
   | 工作区 | 当前打开的工作区 |
   | 当前文件夹 | 打开颜色面板时，活动文件所属的工作区文件夹；适合多文件夹工作区 |

   没有打开工作区时，只能选择“用户”。没有活动文件时，当前文件夹使用工作区的第一个文件夹。

5. 找到需要修改的角色，例如 **类型声明**、**类型引用**、**字段声明**或 **字段引用 / 字典键**。点击这一行的颜色方块，在颜色选择器中选色；也可以在旁边输入 `#RRGGBB`，需要透明度时输入 `#RRGGBBAA`。
6. 点击顶部的 **保存颜色**。页面显示“颜色已保存”后，打开的 Sproto 文件自动刷新颜色，不需要重启 VS Code。尚未保存的选择不会改变编辑器颜色。

例如，想让 `.Player` 的声明与 `player 0 : Player` 中的引用颜色不同，分别设置 **类型声明** 和 **类型引用**，然后点击“保存颜色”。修改一个角色不会同时改变另一个角色。

### 恢复继承或默认颜色

- **恢复一项**：勾选该行的 **继承**，再点击 **保存颜色**。插件会删除当前保存范围的颜色覆盖，继承上级范围或编辑器原生配色。
- **恢复全部**：点击 **全部继承**，再点击 **保存颜色**。只清除当前选定范围的覆盖，其他范围的配置保持不变。
- 行内的 **当前有效覆盖** 表示已有的 Sproto 颜色设置；显示 **编辑器 / 主题默认** 时，使用原生语义规则和主题配色。

字段默认白色、内置类型默认蓝色；未指定数字颜色时跟随当前主题。如果工作区还有单独的颜色设置，恢复用户级设置后，工作区设置仍可能生效。

### 通过 VS Code 设置面板操作

按 **Ctrl+,**（macOS：**Cmd+,**）打开设置，搜索 **Sproto**，即可看到各个角色的颜色输入项。也可以在命令面板运行 **Sproto: 打开设置**，直接筛选此插件的设置。

设置面板中的颜色输入项接受十六进制颜色；希望使用可点击的颜色选择器时，运行 **Sproto: 配置高亮颜色**。设置面板中的修改自动保存，独立颜色面板中的修改需要点击“保存颜色”。

### 保留 JSON 配置方式

图形面板和设置面板使用同一套 `sproto.colors.*` 属性，也可以直接在 `settings.json` 中修改。例如：

```json
{
  "sproto.colors.typeDeclaration": "#4EC9B0",
  "sproto.colors.typeReference": "#00BFA5",
  "sproto.colors.fieldDeclaration": "#FFFFFF",
  "sproto.colors.fieldReference": "#9CDCFE",
  "sproto.colors.integer": "#569CD6",
  "sproto.colors.fieldTag": "#B5CEA8"
}
```

显式的 `sproto.colors.*` 颜色优先于原生语义颜色规则。删除某个属性可继承上级范围；写空字符串表示该范围使用编辑器原生配色。未设置这些属性时，仍可通过 `editor.semanticTokenColorCustomizations` 自定义颜色。

## 参考

- [Sproto Schema Language](https://github.com/cloudwu/sproto#schema-language)
- [VS Code Language Features](https://code.visualstudio.com/api/language-extensions/programmatic-language-features)
- [VS Code Semantic Highlighting](https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide)

## 生成说明

本插件的代码、功能实现与文档由 **OpenAI Codex** 根据 **Yexiao** 的需求生成，并在使用反馈中持续迭代完善。
