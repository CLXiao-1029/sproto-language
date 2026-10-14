# Sproto Language for JetBrains Rider

作者：**Yexiao**。

The plugin provides bilingual Chinese/English descriptions, color settings, completion details and diagnostics. / 插件说明、颜色设置、补全详情和诊断提示均提供中英文文本。

## 功能

- Sproto 语法高亮，独立区分类型声明/引用、字段声明/字典键引用、协议方法、内置类型、数字、注释和符号。
- **Editor → Color Scheme → Sproto** 提供各角色的图形化颜色设置、字体样式和主题继承。
- 字段默认白色，内置类型默认蓝色，协议方法名默认浅黄色 `#DCDCAA`；未指定数字颜色时继承当前主题。
- Ctrl+B / Ctrl+点击跳转到类型定义，支持嵌套、限定名称和项目内跨文件类型。
- 上下文类型、字典键及精度补全，类型/字段文档与协议模板。
- 语法/类型诊断：未知或歧义类型、重复声明/编号、字典索引及小数精度错误。
- 支持数组、字典、定点整数、内联 request/response 消息体及 response nil。
- 原生 JVM 前端语言支持，提供行注释切换。

## 参考

- [Sproto Schema Language](https://github.com/cloudwu/sproto#schema-language)
- [IntelliJ Custom Language Support](https://plugins.jetbrains.com/docs/intellij/custom-language-support.html)
- [JetBrains Color Scheme Management](https://plugins.jetbrains.com/docs/intellij/color-scheme-management.html)

## 生成说明

本插件的代码、功能实现与文档由 **OpenAI Codex** 根据 **Yexiao** 的需求生成，并在使用反馈中持续迭代完善。
