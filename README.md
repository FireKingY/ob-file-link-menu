# 文件链接菜单

Files 文件菜单提供四个操作。
文件标签页的右键菜单也提供这四个操作。

- **复制文件地址**：复制文件的绝对路径。
- **复制文件**：把文件放入 macOS 剪贴板。随后可在 Finder 中按 `⌘V` 粘贴文件。
- **在 Finder 中打开**：在 Finder 中选中文件。目标是文件夹时，打开文件夹。
- **发送到当前会话**：把文件引用加入当前会话输入框。文件随下一条消息一起发送。

OpenChamber 2.7.0 的扩展接口只向 Files 文件列表提供文件操作。
聊天链接菜单需要附带的桌面适配脚本。
文件标签页菜单也需要桌面适配脚本。
单独安装扩展不会改变聊天链接菜单。
“发送到当前会话”也需要桌面适配脚本。
此操作复用文件树拖入输入框时的文件引用处理逻辑。
此操作保留输入框中已有的内容。
聊天文件链接菜单保留三个文件复制和定位操作。
文件标签页保留原有的关闭和移动面板操作。
右键点击未激活的文件标签时，操作使用该标签对应的完整文件路径。

桌面适配脚本读取 OpenChamber 已解析的文件路径。
路径保留中文、空格和文件名中的标点。
路径不包含代码行号。
普通网页链接使用原来的右键菜单。
脚本也支持代码中的文件引用。

## 安装扩展

1. 在 OpenChamber 中打开下方安装链接。
2. 批准本地服务运行 `open` 和 `osascript` 的权限。
3. 在 Files 文件列表中右键单击文件。

[安装「文件链接菜单」](openchamber://extensions/install?url=https%3A%2F%2Fgithub.com%2FFireKingY%2Fob-file-link-menu)

也可以在“设置 → 扩展”中从 Git 仓库安装。

```text
https://github.com/FireKingY/ob-file-link-menu
```

扩展不添加侧栏面板。
本地服务只在复制文件或调用 Finder 操作时启动。
如果连接远程 OpenChamber，Finder 操作在服务器上执行。
请在本机的 macOS OpenChamber 中使用此扩展。

## 启用聊天链接菜单

桌面适配脚本在宿主页面中运行。
标准扩展页面在沙箱中运行，无法安装此脚本。
脚本使用现有的 `desktop_reveal_path` 接口定位文件。
“复制文件”通过已授权的扩展服务写入 macOS 剪贴板。
如果从 1.0.0 更新，重新批准扩展新增的 `osascript` 权限。

先把本机 OpenChamber 的 `web-dist` 目录写入环境变量。
该目录位于应用资源目录中的 `Contents/Resources/web-dist`。

```bash
export OPENCHAMBER_WEB_DIST="/path/to/OpenChamber.app/Contents/Resources/web-dist"
```

先查看改动计划。

```bash
bun run desktop:plan
```

批准桌面端改动后，应用适配脚本。

```bash
bun run desktop:apply
```

重新载入 OpenChamber 页面。

安装脚本修改所选目录中的以下页面。

- `index.html`
- `mini-chat.html`

安装脚本在同一目录添加一个包含内容摘要的 JavaScript 文件。
安装脚本把原页面备份到当前用户的数据目录。
如果设置了 `XDG_DATA_HOME`，脚本使用该数据目录。
默认备份子目录是 `file-link-menu/desktop-backups`。
通过 `FILE_LINK_MENU_BACKUP_DIR` 可以指定备份目录。
安装脚本保留页面中的其他改动。
如果应用更新覆盖页面，重新运行适配脚本。
应用资源改动会影响应用的资源签名校验。

适配脚本独立于扩展启用状态。
如果要停止聊天链接菜单，运行撤销命令。

```bash
bun run desktop:remove
```

重新载入 OpenChamber 页面。

撤销命令只移除本扩展的页面加载标记。
撤销命令保留其他页面改动。
撤销命令保留不再加载的 JavaScript 文件。

## 开发

```bash
bun install --frozen-lockfile
bun run build
bun run typecheck
bun test
bunx openchamber-guest-check
```

如果要在其他目录预览适配脚本，传入 `web-dist` 目录。

```bash
node scripts/desktop-adapter.mjs plan /absolute/path/to/web-dist
```

如果系统安装了 Electron，运行桌面交互验证。

```bash
electron scripts/smoke-desktop.cjs
```

验证脚本使用独立的页面和模拟的剪贴板。
验证脚本不修改 OpenChamber，也不启动 Finder。

如果要验证 macOS 文件剪贴板，运行原生验证。

```bash
node scripts/smoke-copy-file.mjs
```

此验证通过打包后的服务复制测试文件。
此验证读取剪贴板中的文件 URL 和 NSURL 对象。
如果剪贴板仍包含测试文件，验证脚本恢复原有剪贴板内容。

如果要验证“发送到当前会话”，运行会话文件验证。
此验证使用沙箱中的扩展页面和实际的 CodeMirror 编辑器。
此验证包含全选的多行草稿、带空格路径和侧栏会话。
通过 `FILE_LINK_MENU_UI_SOURCE` 指定已安装依赖的 OpenChamber `packages/ui` 目录。

```bash
export FILE_LINK_MENU_UI_SOURCE="/path/to/openchamber/packages/ui"
electron scripts/smoke-session-file.cjs
```

通过 `FILE_LINK_MENU_TEST_TMP` 可以指定验证文件的临时目录。

如果要验证文件标签页菜单，运行标签页验证。
此验证也需要 `FILE_LINK_MENU_UI_SOURCE` 指向已安装依赖的 OpenChamber `packages/ui` 目录。

```bash
electron scripts/smoke-file-tabs.cjs
```

此验证使用实际的 Base UI 菜单组件。
此验证包含未激活的同名标签、四个文件操作、原有菜单操作和键盘导航。
