<p align="center">
  <img src="assets/icon.png" alt="Project Grid" width="88" />
</p>

<h1 align="center">Project Grid · 项目矩阵</h1>

<p align="center"><strong>同时让 Codex 和 Claude Code 跑六个项目，你只在它们需要你的时候回来。</strong></p>
<p align="center">为并行使用 AI 编码助手而生的 Windows / macOS / Linux 工作台：一屏看全所有项目，谁在干活、谁做完了、谁在等你，一眼就知道。</p>

<p align="center">
  <a href="https://github.com/noeigenstate/project-grid/releases/latest"><img src="https://img.shields.io/github/v/release/noeigenstate/project-grid?style=flat-square&color=78bfa1&label=release" alt="Latest release" /></a>
  <a href="https://github.com/noeigenstate/project-grid/releases"><img src="https://img.shields.io/github/downloads/noeigenstate/project-grid/total?style=flat-square&color=8ebce5&label=downloads" alt="Downloads" /></a>
  <img src="https://img.shields.io/badge/Windows-10%20%2F%2011%20x64-8ebce5?style=flat-square" alt="Windows 10 / 11 x64" />
  <img src="https://img.shields.io/badge/macOS-12%2B%20Apple%20silicon-8ebce5?style=flat-square" alt="macOS 12+ Apple silicon" />
  <img src="https://img.shields.io/badge/Linux-x64%20%2F%20arm64-8ebce5?style=flat-square" alt="Linux x64 / arm64" />
  <img src="https://img.shields.io/badge/Codex%20%2B%20Claude%20Code-supported-d8a6e8?style=flat-square" alt="Codex and Claude Code" />
</p>

<p align="center">
  <a href="https://github.com/noeigenstate/project-grid/releases/latest"><strong>⬇️ 下载 Windows / macOS / Linux 版</strong></a> ·
  <a href="#它解决什么问题">为什么</a> ·
  <a href="#亮点">亮点</a> ·
  <a href="#三步开始">开始使用</a> ·
  <a href="README.en.md">English</a>
</p>

<p align="center">
  <img src="docs/images/demo.gif" alt="Project Grid 演示：一个项目完成后亮起，点开以文档排版阅读 Codex 的对话，答案实时出现，再缩回总览" width="960" />
</p>
<p align="center"><sub>真实界面，演示项目。卡片蓝色表示正在处理，做完后粉色呼吸提醒；点开就能读到它这一轮做了什么。</sub></p>

## 它解决什么问题

AI 编码助手一跑就是几分钟。只盯一个项目太浪费，开五个窗口又总会错过——另一个窗口里的任务早就结束了，或者它卡在一个问题上等你回答，而你毫不知情。

**Project Grid 把每个项目放进一张卡片**：每张卡片是一个真实终端，运行 Codex CLI 或 Claude Code。你下完指令就去忙别的，它们会自己告诉你进展：

- 🔵 **整块玻璃泛蓝**：正在处理，可以不用管它
- 🩷 **粉色呼吸、语音播报**：这一轮做完了，等你查看
- 🟢 **绿色常亮**：已经看过，随时下达下一条指令

不用换工具：终端里跑的就是你装好的 `codex` 和 `claude`，按键、颜色、交互和平时一模一样。

## 亮点

### 🧩 一屏看全所有项目

<img src="docs/images/overview.jpg" alt="总览：六个项目，正在处理的卡片泛蓝，待查看的粉色，已完成的绿色，Codex 与 Claude Code 并排" width="100%" />

网格随项目数量自动排列，鼠标移到哪张卡片，哪张就轻轻浮起。按住标题栏拖动排序，点开放大、按快捷键缩回，终端会话和没发出去的草稿都不会丢。同一个项目还能开多个终端分屏。本地项目和 Linux SSH 项目放在同一张网格里。

**完成提醒是准确的。** 状态读自 Codex 和 Claude Code 自己记录的会话轮次，而不是猜测终端安静了多久：子任务先结束不算，命令跑完不算，只有主任务这一轮真正结束才提醒，而且每条指令只提醒一次。

### 📖 读得懂的对话，而不是字符格

<img src="docs/images/reading-view.jpg" alt="阅读视图：Codex 的回答按文档排版，标题、列表、代码块和折叠的工具调用；右侧活动栏实时显示每一步和本轮概览" width="100%" />

一键把 Claude Code 或 Codex 的对话切换成**文档排版**：标题、彩色圆点列表、行内代码、带「复制」按钮的代码块，工具调用折叠成一行。底部输入框直接发给下面的真实终端，随时切回终端。

- **CLI 的输出也重新排版。** `/usage`、`/status`、`/context` 这类斜杠命令的结果不再是终端里的字符画：边框去掉，统计排成对照表，用量变成进度条，分组有小标题，直接排进对话，关闭后也留在原处。输入 `/` 列出全部命令，`@` 提及项目文件。
- **提问和确认变成卡片。** 权限确认、`/model` 这类选择菜单，以及 Claude Code（AskUserQuestion）和 Codex（Plan 模式）向你提的问题，都显示成可点选的卡片；它正在做什么也像 CLI 一样写在对话末尾，带计时和「Esc 中断」。

右侧的**活动栏**顶部固定本轮的工具调用、完成、失败和用时；实时动态逐条写明它做了什么——命令原文、用了哪个技能、调用了哪个 MCP 工具、新建或修改了哪些文件；下方是正在处理和排队的任务。

### ✅ 逐块审查它改了什么

<img src="docs/images/git-review.jpg" alt="Git 审查：按 Git 方式显示每一处修改，红色是去掉的行，绿色是新加的行，每一块都能单独保留或还原" width="100%" />

一轮做完，在 Git 栏点开改动的文件，按 `git diff` 的方式逐块显示：去掉的行红色，新加的行绿色。**每一块单独决定**：保留就加入暂存区，不要就还原。已暂存的可以取消，删掉的文件能找回。不用离开窗口，也不用记 `git add -p`。

### 🎙️ 说出指令，听它汇报

<img src="docs/images/voice.jpg" alt="语音输入：卡片中央浮现玻璃质感的话筒窗口，声波随声音起伏" width="100%" />

按 **Ctrl+T** 对当前终端说话，回车发送。语音识别在本机离线完成，**录音不会上传**，无需 API 密钥。

macOS 首次使用语音输入时会请求麦克风权限，可以在「系统设置 › 隐私与安全性 › 麦克风」中管理。

一轮做完时会用自然的女声播报，例如「支付服务，退款接口加幂等校验，完成」。想听更有用的内容？设置里可以让 Codex / Claude Code 自己总结一句结果，或接入云端模型、Ollama / vLLM 等本地模型来总结。

### 还有这些

- **重开即续上**：启动时恢复上次的终端和 Codex / Claude Code 会话，被打断的任务自动发送「继续」。
- **SSH 远程项目**：沿用 VS Code Remote-SSH 的主机配置，终端、文件、Git、预览全部走 SSH，不用把项目下载下来。
- **文件就在手边**：目录树、自动保存的编辑器，图片、网页、视频、Markdown 直接预览；Windows 和 Linux 用 `Ctrl+点击`、macOS 用 `⌘+点击`直接打开终端里的路径。
- **好看，也清楚**：液态玻璃界面保留自然壁纸主题；想要最锐利的文字，切换到「实色」材质即可。
- **可选简洁外观**：浅色「黑白橙」与深色「白黑橙」，可调终端字体、字重和背景透明度，支持手动应用主题推荐配置；平台支持时可选择桌面磨玻璃。[使用说明与效果](docs/appearance-increment.md)。
- **中英双语、快捷键可改、Windows 自动更新**；第一次打开时在界面上一步步带你上手。

## 三步开始

**需要：** Windows 10 / 11（x64），或搭载 Apple 芯片（M1 或更新型号）、运行 macOS 12 或更高版本的 Mac（不支持 Intel Mac），或 64 位 Linux 桌面（x64 或 arm64，例如 Ubuntu 22.04 或更新版本）。还需要 [Codex CLI](https://github.com/openai/codex) 或 [Claude Code](https://docs.anthropic.com/claude-code) 至少一个——没装也没关系，「设置 › 编码助手」里可以一键安装。

1. **下载安装**：按下面对应平台的说明安装。
2. **添加项目**：按 `Ctrl+Shift+N` 选择项目文件夹，可以一次选多个，也可以添加 SSH 远程项目。
3. **开始工作**：在卡片的终端里输入 `codex` 或 `claude`，下达指令，然后去忙别的。粉色亮起时回来看结果。

### Windows 安装

从 [Releases](https://github.com/noeigenstate/project-grid/releases/latest) 下载 `Project-Grid-Setup-版本号-x64.exe`。

选择 PowerShell 或命令提示符、Windows PATH 刷新、开始菜单快捷方式、NSIS 安装程序和自动更新仅适用于 Windows。

### macOS 安装

**0.6.8 新增 macOS 版**，支持 Apple 芯片 Mac（M1 或更新型号）和 macOS 12 或更高版本。GitHub [Releases](https://github.com/noeigenstate/project-grid/releases/latest) 提供 `Project-Grid-<version>-mac-arm64.dmg`、`Project-Grid-<version>-mac-arm64.zip` 和校验文件 `SHA256SUMS-mac.txt`。

推荐在终端运行以下命令安装，更新时也用同一条命令：

```bash
curl -fsSL https://raw.githubusercontent.com/noeigenstate/project-grid/main/scripts/install-macos.sh | bash
```

脚本下载最新版本的 ZIP，验证 SHA-256 校验和，安装到 `/Applications`（该目录不可写时改用 `~/Applications`），然后打开应用。无需管理员密码；`curl` 下载的文件不带隔离标记，因此打开时不会出现 Gatekeeper 提示。**macOS 版不会自动更新**，再次运行安装命令即可更新。

可以在管道后的 `bash` 前设置这些变量：

- `PROJECT_GRID_VERSION=0.6.13`：安装指定版本。
- `PROJECT_GRID_INSTALL_DIR=~/Applications`：指定安装目录。
- `PROJECT_GRID_OPEN=0`：安装后不打开应用。

例如，安装 0.6.13：

```bash
curl -fsSL https://raw.githubusercontent.com/noeigenstate/project-grid/main/scripts/install-macos.sh | PROJECT_GRID_VERSION=0.6.13 bash
```

如果已经下载了 ZIP，也可以用本地的安装脚本安装：

```bash
bash install-macos.sh ~/Downloads/Project-Grid-0.6.13-mac-arm64.zip
```

应用使用临时签名（ad-hoc），没有 Apple Developer ID，也未经过 Apple 公证。如果用浏览器下载 DMG，再将应用拖到「应用程序」，首次打开时 macOS 会提示「无法验证开发者」。在「系统设置 › 隐私与安全性」中点一次「仍要打开」，或运行：

```bash
xattr -dr com.apple.quarantine "/Applications/Project Grid.app"
```

### macOS 终端与快捷键

本地终端以登录 shell 方式运行 zsh（`/bin/zsh`），照常加载你自己的 `~/.zshenv`、`~/.zprofile`、`~/.zshrc` 和 `~/.zlogin`。Project Grid 在此基础上加入提示符状态报告和 `codex` / `claude` 包装层，支持轮次状态、Claude Code hooks、完成提醒和会话恢复，不修改任何用户文件。你为 `codex` 或 `claude` 定义的别名仍然有效。SSH 项目的用法与 Windows 相同。

终端中用 `⌘C` / `⌘V` / `⌘A` 复制、粘贴和全选，`Control+C` 中断命令，`⌘+点击`打开链接。`⌘Q` 退出（终端仍在运行时会先询问），`⌘H` 隐藏，`⌘M` 最小化。设置里的项目快捷键仍默认使用 Control，例如 `Control+Shift+N` 添加项目。

放大项目只会在当前窗口内展开，不会切换到全屏空间（Space）。需要全屏时，使用窗口的绿色按钮或全屏快捷键。

### Linux 安装

**0.6.9 新增 Linux 版**，支持 x64 和 arm64。GitHub [Releases](https://github.com/noeigenstate/project-grid/releases/latest) 提供 `Project-Grid-<version>-linux-x86_64.AppImage`、`Project-Grid-<version>-linux-arm64.AppImage`、同内容的 `.tar.gz` 压缩包，以及校验文件 `SHA256SUMS-linux-x64.txt` / `SHA256SUMS-linux-arm64.txt`。

推荐用 AppImage，下载后无需安装：

```bash
chmod +x Project-Grid-*-linux-*.AppImage
./Project-Grid-*-linux-*.AppImage
```

也可以解压 `.tar.gz`，运行其中的 `./project-grid`。Ubuntu 23.10 及更新版本默认禁止未登记的程序使用 Chromium 沙箱所需的用户命名空间，这时运行压缩包里的程序要加上 `--no-sandbox`；AppImage 会自动检测并处理。**Linux 版不会自动更新**，下载新版本替换即可。

### Linux 终端与快捷键

本地终端可在「设置 › 终端与编辑 › 终端」中选择 Bash 或 zsh，默认跟随你的登录 shell（`$SHELL`）。没装 zsh 时只能选 Bash。Bash 与普通终端一样读取 `/etc/bash.bashrc`（如有）和你自己的 `~/.bashrc`；zsh 照常加载 `~/.zshenv`、`~/.zprofile`、`~/.zshrc` 和 `~/.zlogin`。Project Grid 在此基础上加入提示符状态报告和 `codex` / `claude` 包装层，支持轮次状态、Claude Code hooks、完成提醒和会话恢复，不修改任何用户文件；你为 `codex` 或 `claude` 定义的别名仍然有效。SSH 项目的用法与 Windows 相同。

快捷键与 Windows 一致：终端里选中文字后 `Ctrl+C` 复制（或 `Ctrl+Shift+C`），`Ctrl+V` 粘贴，`Ctrl+Shift+A` 全选，没有选中时 `Ctrl+C` 中断命令，`Ctrl+点击`打开链接。目录栏的文件可以和系统文件管理器（Files、Dolphin、Thunar 等）互相复制粘贴；读取剪贴板时优先使用已安装的 `wl-paste` 或 `xclip`。

<details>
<summary><strong>常用快捷键</strong>（都可以在设置里改）</summary>

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl + Shift + N` | 添加项目 |
| `Ctrl + Shift + Enter` | 放大或还原当前项目 |
| `Ctrl + Shift + G` | 返回总览 |
| `Ctrl + Tab` / `Ctrl + Shift + Tab` | 下一个 / 上一个项目 |
| `Ctrl + Shift + T` | 当前项目新建终端并分屏 |
| `Ctrl + T` | 语音输入，回车发送，Esc 取消 |
| `Ctrl + Shift + F` | 搜索项目 |
| `Ctrl + B` | 展开或收起目录栏 |
| `F11` | 窗口全屏 |
| `Ctrl + ,` | 设置 |

</details>

## 常见问题

<details>
<summary><strong>我的代码和数据会被上传吗？</strong></summary>

Project Grid 本身**不收集任何数据，没有统计上报**。它只会访问：GitHub（检查更新）、Hugging Face 或其国内镜像（首次下载离线语音模型）。只有当你在设置里主动选择用云端模型总结播报内容时，才会把那一轮的最终回复发给你选的服务商。Codex 和 Claude Code 本身与各自服务的通信，和你平时在终端里使用时一样。

</details>

<details>
<summary><strong>和直接开几个终端 / VS Code 有什么区别？</strong></summary>

终端还是那个终端，区别在于 Project Grid **知道 AI 助手在什么状态**：它读取 Codex 和 Claude Code 的会话记录，准确判断这一轮是在处理、做完了还是被中断，并用颜色、通知和语音告诉你。再加上阅读视图、活动栏和逐块 Git 审查，是专门为「同时盯多个 AI 任务」设计的。

</details>

<details>
<summary><strong>支持 macOS / Linux 吗？</strong></summary>

支持 Windows 10 / 11 x64；从 0.6.8 起也支持 Apple 芯片 Mac（M1 或更新型号），需要 macOS 12 或更高版本，不支持 Intel Mac；从 0.6.9 起支持 x64 和 arm64 的 Linux 桌面，本地终端可选 Bash 或 zsh，见 [Linux 安装](#linux-安装)。远程项目可以是任意装有 Python 3.6+ 和 Bash 的 Linux 服务器。

</details>

<details>
<summary><strong>会改动我的 Codex / Claude Code 配置吗？</strong></summary>

不会。完成提醒所需的设置在启动时临时传入，不写入你的配置文件，你自己的 hook 和设置照常生效。

</details>

更多细节——会话恢复、SSH、文件预览、播报方式、开发与发布——见 [使用文档](docs/usage.md)。

## 路线图

- [ ] 项目分组与快捷切换
- [ ] 更多命令行编码助手接入统一提醒
- [ ] 每一轮的结果与产物记录，方便回看
- [x] Linux 桌面版（0.6.9）
- [ ] WSL 工作区

有想法？欢迎提 [Issue](https://github.com/noeigenstate/project-grid/issues)。觉得有用的话，点个 ⭐ Star 让更多人看到。

## 参与开发

```powershell
git clone https://github.com/noeigenstate/project-grid.git
cd project-grid
npm ci
npm start              # 开发运行
npm test               # 单元测试
npm run test:desktop   # 真实桌面交互测试
npm run dist           # 构建安装版
npm run dist:linux     # 在 Linux 上构建本机架构的 AppImage 与 tar.gz
```

Electron · React · TypeScript · xterm.js · node-pty。每个版本都要通过单元测试、打包版桌面测试和 Linux SSH 集成测试后才会发布。README 里的截图和演示由 `scripts/readme-shots.mjs` 从演示项目自动生成。

## 许可证

本项目以 [MIT 许可证](LICENSE) 开源：可以自由使用、复制、修改、合并、发布、分发、再授权和销售，只需在副本中保留版权声明和许可声明。软件按“原样”提供，不附带任何担保。

---

<p align="center">
  <strong>让 AI 去干活，让注意力回到需要你的项目。</strong><br />
  <a href="https://github.com/noeigenstate/project-grid/releases/latest">下载体验</a> ·
  <a href="https://github.com/noeigenstate/project-grid/issues">反馈与建议</a>
</p>
