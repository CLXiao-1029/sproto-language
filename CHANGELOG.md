# 更新记录 / Changelog

## 1.0.1 — 2026-10-14

从 1.0.0 升级，本次为问题修复版本。VS Code 与 Rider 使用相同版本号，已有自定义颜色设置继续有效。

### VS Code

- 修复插件说明中的 Logo 无法加载：补齐 HTTPS GitHub 仓库信息、插件子目录、主页与问题反馈地址。
- README 源文件保留 `./images/logo.png` 相对路径，便于项目内预览；构建 VSIX 时自动转换为正确的绝对 HTTPS 图片地址，适配扩展详情页的图片加载要求。
- 调整图片验证测试：允许实际存在的本地相对路径，不再限定源文件只能使用固定的 GitHub 图片地址。

### JetBrains Rider

- 新增独立的 16×16 文件图标 `icons/sprotoFile.svg`，用于项目文件树、编辑器标签页及颜色设置页面。
- 插件列表继续使用 40×40 的 `META-INF/pluginIcon.svg`，修复文件图标过大导致的布局问题。
- 增加文件图标尺寸、插件图标尺寸与文件类型图标绑定检查。

### 版本与归档

- 两个插件的当前版本统一为 `1.0.1`，移除“发布次数决定大端号”的限制。
- 日常优化和修复只递增小端号；中端号与大端号在重构、大功能等指定更新时另行评估。
- 1.0.0 安装包保留在 `dist/archive/1.0.0/`；误编号的 2.0.0 包保留在 `dist/archive/2.0.0/`，不作为当前发行版本。
- 当前安装包清单及 SHA-256 校验值见 `dist/index.json`。

### 验证与升级

- VS Code：13 组测试通过。
- Rider：51 项模型检查及 SDK 冒烟测试通过；确认文件图标为 16×16、插件图标为 40×40。
- 包内容检查通过，确认 VSIX 中的 Logo 地址为 HTTPS。
- 从 1.0.0 安装新版后，重载 VS Code 窗口或按 Rider 提示重启。若曾安装误编号的 2.0.0，请先卸载该版本，再安装 1.0.1。

### English release notes

- **VS Code:** Fixed the README logo by adding HTTPS repository metadata and resolving local relative image paths to absolute HTTPS URLs when packaging. Local README previews can retain their relative paths.
- **Rider:** Added a dedicated 16×16 file icon for the project tree, editor tabs and color settings. The plugin-list icon remains 40×40.
- **Versioning:** Both plugins use 1.0.1. Routine fixes increment the patch version instead of automatically increasing the major version. Existing color settings are preserved.
- **Validation:** VS Code tests, Rider model/SDK checks and package-content checks passed. Current package hashes are listed in `dist/index.json`.
