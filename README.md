# Sproto Language 插件

<img src="assets/branding/logo.png" alt="SProto logo" width="480" />

作者：**Yexiao**。插件代码、功能实现与文档由 **OpenAI Codex** 根据 Yexiao 的需求生成并迭代完善。

两个插件的用户可见说明、设置标签、颜色面板、补全详情和诊断提示均提供中文/English 双语文本。

为 **JetBrains Rider 2025.2.x** 和 **VS Code 1.85+** 提供 Sproto 编辑支持。

## 功能

| 功能 | Rider | VS Code |
| --- | --- | --- |
| 注释、类型、字段、协议、内置类型、编号、符号高亮 | ✓ | ✓ |
| 类型定义跳转（嵌套、限定名称、跨文件） | Ctrl+B / Ctrl+点击 | F12 / Ctrl+点击 |
| 上下文类型、内置类型、字典键和精度补全 | Ctrl+Space | Ctrl+Space |
| 类型、字段悬停说明 | Quick Documentation / Ctrl+Q | 悬停 |
| 语法错误、未知类型、重复声明/编号、字典/精度错误 | 编辑器标记 | 编辑器标记及 Problems |
| 类型、字段、协议模板 | 补全 type / field / protocol | 补全 type / field / protocol |
| 行注释切换 | Ctrl+/ | Ctrl+/ |
| 文件符号列表 | — | Outline / Ctrl+Shift+O |

支持 `.Type {}`、嵌套类型、`field tag : Type`、`*Type`、`*Type(key)`、`*KV()`、`integer(n)`、`request Type`、`response Type`、内联消息体和 `response nil`。内置类型为 `integer`、`boolean`、`string`、`binary`、`double`。

类型解析从当前类型作用域逐级向外查找，再查找顶层。协议消息体直接引用只接受全限定结构体名称或 `nil`。同一名称优先使用当前文件定义；其他文件中存在多个定义时显示歧义错误。跨文件功能把当前项目/工作区文件夹内的 `.sproto` 当作一个编辑索引；这不改变 Sproto 编译器的行为，编译时仍需自行合并对应 schema。

VS Code 多文件夹工作区按文件夹隔离索引，排除 `.git`、`node_modules`、`Library`、`Temp`、`build`、`dist` 目录；保存、编辑、创建和删除文件后自动更新。Rider 使用 IDE 项目文件索引与 PSI 缓存，排除 IDE 标记为 Excluded 的目录；索引期间部分跨文件功能可能暂不可用。

## 安装

构建输出在 `dist/`（VS Code 与 Rider 统一版本 2.0.0，第 2 次正式编号）：

- VS Code：扩展面板右上角 `…` → **Install from VSIX…** → 选择 `sproto-vscode-2.0.0.vsix`，运行 **Developer: Reload Window**。不要通过 Visual Studio 的 VSIX Installer 双击安装。
- Rider：Settings → Plugins → 齿轮 → **Install Plugin from Disk…** → 选择 `sproto-rider-2.0.0.zip`，按 IDE 提示重启。

VS Code 的发布者标识已更新为 `Yexiao`，扩展 ID 为 `Yexiao.sproto-language`。从旧版升级时先卸载 `sproto-tools.sproto-language`，再安装新包，避免同时启用两个提供同名语言功能的扩展。已有 `sproto.colors.*` 设置可继续使用。

默认字段为白色 `#FFFFFF`，内置类型为 VS Code 蓝色 `#569CD6`；类型默认青绿色，两端协议方法名默认浅黄色 `#DCDCAA`。数字、注释、关键字及符号未设置固定默认颜色，继承当前主题。VS Code 设置面板内有 **Sproto** 分类，命令 **Sproto: 配置高亮颜色** 提供图形化颜色选择器。Rider 提供中文分组的 **Color Scheme → Sproto** 设置页面。声明、引用与各种语法角色可分别设置。详见 [完整颜色配置说明](docs/highlighting.md)。

本文件是项目文档，包含两个实现的功能、安装、开发、构建与测试说明。市场描述分别使用 [VS Code 插件 README](vscode/README.md) 和 [Rider 插件 README](rider/README.md)，包含对应插件的功能、参考、作者及生成说明。VSIX 仅打包 `vscode/README.md`；Rider JAR 包含 `rider/README.md`，市场展示使用 `plugin.xml` 的 Rider 专属功能描述。项目 README 和 `docs/` 不进入任何插件包。

`plugin-release.json` 统一记录版本与作者。发布时同步更新该文件、VS Code `package.json` 和 Rider `plugin.xml`；构建脚本会检查三者一致，并从元数据读取包名与发布者，避免打包版本或作者不一致。

正式发行编号从 1 开始累计，对应插件版本 `1.0.0`、`2.0.0`、`3.0.0` 等；两端同步更新。原有 0.x 安装包全部归档到 `dist/archive/0.x/`，归档索引记录文件名、版本、大小与 SHA-256。

统一品牌素材位于 `assets/branding/`：VS Code 使用 PNG 图标与 Logo；Rider 使用 SVG 插件/文件图标与 PNG Logo。

2.0.0 修复 VS Code 插件说明中的 Logo 加载：仓库元数据使用 HTTPS，说明图片指向 GitHub `master/vscode/images/logo.png` 的绝对 HTTPS 地址。Rider 将文件图标拆分为 16×16 的 `icons/sprotoFile.svg`，插件列表仍使用 40×40 的 `META-INF/pluginIcon.svg`。1.0.0 安装包保留在 `dist/archive/1.0.0/`。

安装后可打开 `Test/Highlight.sproto` 检查颜色。VS Code 状态栏的语言模式应为 **Sproto**；若该文件曾关联到纯文本或其他语言，可通过右下角语言模式切换到 Sproto。用户自定义的颜色或显式关闭语义高亮设置会优先于插件默认值。

Rider 插件是 JVM 前端插件，运行时无需 Node.js、Lua 或独立语言服务器。VS Code 插件使用编辑器自带的 Node.js 运行时，没有第三方运行依赖。

## 本地构建与测试（Windows PowerShell）

```powershell
# Node.js 18+：测试语言核心并打包 VSIX，无需 npm install
./scripts/build-vscode.ps1

# 使用本机 Rider 2025.2 SDK 与其内置 JDK 21 编译、测试、打包
./scripts/build-rider.ps1 -RiderHome 'C:/Program Files/JetBrains/JetBrains Rider 2025.2.5'
```

如果 PowerShell 阻止本地脚本，使用 `powershell -ExecutionPolicy Bypass -File ./scripts/build-vscode.ps1`；该参数只对该次进程有效。

VS Code 开发调试：在 VS Code 中打开本仓库的 `vscode/` 子目录，按 F5 启动 Extension Development Host，再打开 `.sproto` 文件。核心、适配器与 GUI 设置测试运行 `node --test vscode/test/core.test.js vscode/test/extension.test.js vscode/test/colors.test.js`。

Rider 源码位于 `rider/src/main/`，本地构建脚本直接引用指定 IDE 的 SDK JAR，避免下载整个 SDK。此版本的兼容范围固定为 build 252（2025.2）；支持其他版本前应重新编译并运行 JetBrains Plugin Verifier 及 IDE 实测。

测试包含内置 `Test/Highlight.sproto` 示例、作用域/跨文件解析、歧义、内置类型、数组/字典、精度、协议、重复定义、错误恢复、补全，以及中文/emoji/CRLF 的 UTF-16 定位。VS Code 适配器测试通过 API 测试替身验证提供器注册、跨工作区隔离、未保存编辑器、文件关闭与删除后的诊断刷新；Rider SDK 冒烟测试加载全部注册实现并检查词法器覆盖及重启。VSIX 已通过 VS Code CLI 在独立测试目录中的安装验证。尚未在 Rider/VS Code 图形编辑器内完成交互验收，也未运行 Plugin Verifier；建议安装后检查高亮、F12/Ctrl+B、补全、悬停，以及编辑未保存的类型声明后跨文件跳转和错误提示的刷新。

## 实现与参考

两个编辑器使用各自原生 API；JS 和 Java 语言核心用相同规则与样例测试。尚未实现重命名、格式化、编译或 Marketplace 发布。

- [Sproto Schema Language](https://github.com/cloudwu/sproto#schema-language)
- [VS Code Language Features](https://code.visualstudio.com/api/language-extensions/programmatic-language-features)
- [IntelliJ Custom Language Support](https://plugins.jetbrains.com/docs/intellij/custom-language-support.html)
