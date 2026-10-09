<p align="center">
  <img src="assets/icon.png" alt="Project Grid" width="88" />
</p>

<h1 align="center">Project Grid</h1>

<p align="center"><strong>Run Codex and Claude Code on six projects at once. Come back only when one of them needs you.</strong></p>
<p align="center">A Windows / macOS / Linux workspace built for parallel AI coding agents: every project on one screen, and at a glance you know which one is working, which one is done and which one is waiting for you.</p>

<p align="center">
  <a href="https://github.com/noeigenstate/project-grid/releases/latest"><img src="https://img.shields.io/github/v/release/noeigenstate/project-grid?style=flat-square&color=78bfa1&label=release" alt="Latest release" /></a>
  <a href="https://github.com/noeigenstate/project-grid/releases"><img src="https://img.shields.io/github/downloads/noeigenstate/project-grid/total?style=flat-square&color=8ebce5&label=downloads" alt="Downloads" /></a>
  <img src="https://img.shields.io/badge/Windows-10%20%2F%2011%20x64-8ebce5?style=flat-square" alt="Windows 10 / 11 x64" />
  <img src="https://img.shields.io/badge/macOS-12%2B%20Apple%20silicon-8ebce5?style=flat-square" alt="macOS 12+ Apple silicon" />
  <img src="https://img.shields.io/badge/Linux-x64%20%2F%20arm64-8ebce5?style=flat-square" alt="Linux x64 / arm64" />
  <img src="https://img.shields.io/badge/Codex%20%2B%20Claude%20Code-supported-d8a6e8?style=flat-square" alt="Codex and Claude Code" />
</p>

<p align="center">
  <a href="https://github.com/noeigenstate/project-grid/releases/latest"><strong>⬇️ Download for Windows / macOS / Linux</strong></a> ·
  <a href="#why">Why</a> ·
  <a href="#highlights">Highlights</a> ·
  <a href="#get-started">Get started</a> ·
  <a href="README.md">中文</a>
</p>

<p align="center">
  <img src="docs/images/demo.gif" alt="Project Grid demo: a project finishes and lights up, another opens to show its Codex conversation laid out as a document while the answer arrives, then shrinks back into the grid" width="960" />
</p>
<p align="center"><sub>The real app with demo projects (the interface is also available in English). Blue means working; pink breathing means a round is done and waiting for you.</sub></p>

## Why

An AI coding agent takes minutes per round. Watching one project is a waste of your time; juggling five windows means you miss things: a task that finished ten minutes ago, or an agent stuck on a question nobody answered.

**Project Grid puts each project in a card.** Each card is a real terminal running Codex CLI or Claude Code. Give an instruction, go do something else, and the cards tell you how things stand:

- 🔵 **The whole pane turns blue**: working, leave it be
- 🩷 **Pink breathing glow and a spoken notice**: this round is done, come and look
- 🟢 **Steady green**: seen; ready for your next instruction

No new tool to learn: the terminals run the `codex` and `claude` you already have, with the same keys, colours and interaction.

## Highlights

### 🧩 Every project on one screen

<img src="docs/images/overview.jpg" alt="Overview: six projects; the working card is tinted blue, one waits in pink, one is done in green, Codex and Claude Code side by side" width="100%" />

The grid arranges itself as you add projects, and the card under the pointer lifts gently. Drag a header to reorder, expand a card and shrink it back, and the terminal session and any unsent draft stay intact. Split a project into several terminals. Local folders and Linux SSH projects share the same grid.

**Completion alerts you can trust.** State comes from the session records Codex and Claude Code keep themselves, not from guessing how long the terminal has been quiet: a sub-agent finishing doesn't count, a command exiting doesn't count; only the end of the main round does, and each instruction alerts once.

### 📖 Read the conversation, not a character grid

<img src="docs/images/reading-view.jpg" alt="Reading view: the Codex answer laid out as a document with headings, lists, a code block and folded tool calls; the activity pane on the right lists every step and an overview of the round" width="100%" />

Switch any Claude Code or Codex terminal to a **reading view**: headings, coloured bullets, inline code, code blocks with a Copy button, tool calls folded into one line. The box at the bottom writes straight into the real terminal underneath, and the terminal is one click away.

The **activity pane** lists every step live: files edited, commands run, skills and MCP tools called (with what they are for), and below it an overview of the round: the prompts being worked on and waiting, calls made and finished, time taken and the files changed.

### ✅ Review the changes hunk by hunk

<img src="docs/images/git-review.jpg" alt="Git review: each change shown as git does, removed lines in red, added lines in green, each hunk kept or reverted on its own" width="100%" />

When a round ends, open a changed file from the Git tab and see it the way `git diff` does: removed lines red, added lines green. **Decide each hunk on its own**: keep it (stage it) or revert it. Unstage what you staged, bring back a deleted file. No context switch, no `git add -p` to remember.

### 🎙️ Speak your instructions, hear the results

<img src="docs/images/voice.jpg" alt="Dictation: a glass microphone window appears over the card, with sound waves that follow your voice" width="100%" />

Press **Ctrl+T** and talk to the current terminal; Enter sends. Speech recognition runs offline on your machine: **nothing is uploaded** and no API key is needed.

On macOS, voice input asks for microphone permission the first time. Manage it under System Settings › Privacy & Security › Microphone.

When a round finishes, a natural voice tells you which project finished what. Want something more useful? Have Codex or Claude Code sum up the result in one sentence, or use a cloud model, or a local one through Ollama or vLLM.

### And also

- **Pick up where you left off**: on start, your terminals and Codex / Claude Code sessions come back, and an interrupted task is told to continue.
- **SSH projects**: reuse your VS Code Remote-SSH hosts; terminal, files, Git and previews all go over SSH without copying the project down.
- **Files at hand**: file tree, an auto-saving editor, previews for images, web pages, video and Markdown; open a path in the terminal with `Ctrl+click` on Windows and Linux or `⌘+click` on macOS.
- **Beautiful and legible**: the liquid-glass interface retains its nature themes; switch to the solid surface for the sharpest text.
- **Optional monochrome appearance**: light Monochrome Amber and dark White, Black & Amber, adjustable terminal fonts, weight and background transparency, and explicitly applied theme recommendations. Supported systems can use desktop glass. [Guide and examples](docs/appearance-increment.md#english).
- **Chinese and English, rebindable shortcuts, automatic updates on Windows**, and an in-app tutorial the first time you open it.

## Get started

**You need:** Windows 10 / 11 (x64), an Apple silicon Mac (M1 or later) running macOS 12 or later (Intel Macs are not supported), or a 64-bit Linux desktop (x64 or arm64, such as Ubuntu 22.04 or later). You also need [Codex CLI](https://github.com/openai/codex) or [Claude Code](https://docs.anthropic.com/claude-code). Not installed yet? Settings › Coding assistants installs either with one click.

1. **Install**: follow the instructions for your platform below.
2. **Add projects**: press `Ctrl+Shift+N` and pick one or more folders, or add an SSH project.
3. **Work**: type `codex` or `claude` in a card's terminal, give it a task, and go do something else. Come back when it glows pink.

Switch the interface to English under Settings › Appearance › Language.

### Windows installation

Download `Project-Grid-Setup-<version>-x64.exe` from [Releases](https://github.com/noeigenstate/project-grid/releases/latest).

Choosing PowerShell or Command Prompt, Windows PATH refresh, Start-menu shortcuts, the NSIS installer and automatic updates apply only to Windows.

### macOS installation

**Version 0.6.8 adds the macOS edition**, for Apple silicon Macs (M1 or later) running macOS 12 or later. GitHub [Releases](https://github.com/noeigenstate/project-grid/releases/latest) provides `Project-Grid-<version>-mac-arm64.dmg`, `Project-Grid-<version>-mac-arm64.zip` and the checksum file `SHA256SUMS-mac.txt`.

The recommended way to install or update is to run this command in a terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/noeigenstate/project-grid/main/scripts/install-macos.sh | bash
```

The script downloads the latest release ZIP, verifies its SHA-256 checksum, installs to `/Applications` (or `~/Applications` when `/Applications` is not writable), then opens the app. No administrator password is needed. Downloads made with `curl` carry no quarantine flag, so the app opens without a Gatekeeper prompt. **The macOS edition does not update itself**; run the install command again to update.

Set these variables before `bash` on the right side of the pipe:

- `PROJECT_GRID_VERSION=0.6.13`: install a specific release.
- `PROJECT_GRID_INSTALL_DIR=~/Applications`: choose an installation folder.
- `PROJECT_GRID_OPEN=0`: do not open the app after installation.

For example, to install 0.6.13:

```bash
curl -fsSL https://raw.githubusercontent.com/noeigenstate/project-grid/main/scripts/install-macos.sh | PROJECT_GRID_VERSION=0.6.13 bash
```

You can also use a local copy of the install script with a ZIP you already downloaded:

```bash
bash install-macos.sh ~/Downloads/Project-Grid-0.6.13-mac-arm64.zip
```

The app is ad-hoc signed, with no Apple Developer ID, and is not notarized. If you download the DMG in a browser and drag the app to Applications, macOS shows “cannot verify the developer” on first open. Allow it once in System Settings › Privacy & Security › Open Anyway, or run:

```bash
xattr -dr com.apple.quarantine "/Applications/Project Grid.app"
```

### macOS terminals and shortcuts

Local terminals run zsh (`/bin/zsh`) as a login shell, loading your own `~/.zshenv`, `~/.zprofile`, `~/.zshrc` and `~/.zlogin` as usual. Project Grid adds prompt reporting and `codex` / `claude` wrappers for turn status, Claude Code hooks, completion alerts and session restore without modifying any user file. Your aliases for `codex` or `claude` keep working. SSH projects work as on Windows.

In terminals, `⌘C` / `⌘V` / `⌘A` copy, paste and select all; `Control+C` interrupts a command; `⌘+click` opens links. `⌘Q` quits (asking first when terminals are running), `⌘H` hides and `⌘M` minimizes. Project shortcuts in Settings keep their Control-based defaults, such as `Control+Shift+N` to add a project.

Expanding a project stays inside the current window and does not switch to a full-screen Space. Use the green window button or the full-screen shortcut for full screen.

### Linux installation

**Version 0.6.9 adds the Linux edition**, for x64 and arm64. GitHub [Releases](https://github.com/noeigenstate/project-grid/releases/latest) provides `Project-Grid-<version>-linux-x86_64.AppImage`, `Project-Grid-<version>-linux-arm64.AppImage`, `.tar.gz` archives with the same app, and the checksum files `SHA256SUMS-linux-x64.txt` / `SHA256SUMS-linux-arm64.txt`.

The AppImage is recommended and needs no installation:

```bash
chmod +x Project-Grid-*-linux-*.AppImage
./Project-Grid-*-linux-*.AppImage
```

Or unpack the `.tar.gz` and run `./project-grid` inside it. Ubuntu 23.10 and later keep programs without an AppArmor profile from the user namespaces Chromium's sandbox needs; there, start the archive's program with `--no-sandbox`. The AppImage detects this and handles it by itself. **The Linux edition does not update itself**; download the new version to update.

### Linux terminals and shortcuts

Choose Bash or zsh for local terminals under Settings › Terminal and editing › Terminal; until you choose, your login shell (`$SHELL`) decides. zsh can be chosen once it is installed. Bash reads `/etc/bash.bashrc` (where the system has one) and your own `~/.bashrc`, as in any terminal; zsh loads `~/.zshenv`, `~/.zprofile`, `~/.zshrc` and `~/.zlogin` as usual. Project Grid adds prompt reporting and `codex` / `claude` wrappers for turn status, Claude Code hooks, completion alerts and session restore without modifying any user file; your aliases for `codex` or `claude` keep working. SSH projects work as on Windows.

Shortcuts match Windows: in terminals, `Ctrl+C` copies a selection (or `Ctrl+Shift+C`), `Ctrl+V` pastes, `Ctrl+Shift+A` selects all, `Ctrl+C` without a selection interrupts a command, and `Ctrl+click` opens links. Files in the sidebar copy and paste to and from the system file manager (Files, Dolphin, Thunar and others); reading the clipboard uses `wl-paste` or `xclip` when one is installed.

<details>
<summary><strong>Keyboard shortcuts</strong> (all rebindable in Settings)</summary>

| Keys | Action |
| --- | --- |
| `Ctrl + Shift + N` | Add a project |
| `Ctrl + Shift + Enter` | Expand or restore the current project |
| `Ctrl + Shift + G` | Back to the overview |
| `Ctrl + Tab` / `Ctrl + Shift + Tab` | Next / previous project |
| `Ctrl + Shift + T` | New split terminal in the current project |
| `Ctrl + T` | Dictate; Enter sends, Esc cancels |
| `Ctrl + Shift + F` | Search projects |
| `Ctrl + B` | Show or hide the file tree |
| `F11` | Full-screen window |
| `Ctrl + ,` | Settings |

</details>

## FAQ

<details>
<summary><strong>Is my code or data uploaded anywhere?</strong></summary>

Project Grid itself **collects nothing and has no telemetry**. It contacts only GitHub (update checks) and Hugging Face or its mirror (a one-time download of the offline voice models). Only if you choose a cloud model to summarise spoken notices is a round's final reply sent to the provider you picked. Codex and Claude Code talk to their own services exactly as they do in any terminal.

</details>

<details>
<summary><strong>How is this different from a few terminals or VS Code?</strong></summary>

The terminals are the same; the difference is that Project Grid **knows what state each agent is in**. It reads the session records of Codex and Claude Code to tell working, done and interrupted apart, and tells you with colour, notifications and voice. Add the reading view, the activity pane and hunk-by-hunk Git review, and it is built for keeping an eye on several AI tasks at once.

</details>

<details>
<summary><strong>macOS or Linux?</strong></summary>

Windows 10 / 11 x64 is supported. Since 0.6.8, Apple silicon Macs (M1 or later) are also supported on macOS 12 or later; Intel Macs are not supported. Since 0.6.9, Linux desktops on x64 and arm64 are supported, with Bash or zsh for local terminals; see [Linux installation](#linux-installation). Remote projects can be any Linux server with Python 3.6+ and Bash.

</details>

<details>
<summary><strong>Does it change my Codex or Claude Code configuration?</strong></summary>

No. What completion alerts need is passed in when the agent starts and never written to your configuration files; your own hooks and settings keep working.

</details>

More detail on session restore, SSH, previews, spoken notices, and building and releasing is in the [usage guide](docs/usage.md) (Chinese).

## Roadmap

- [ ] Project groups and quick switching
- [ ] Unified alerts for more command-line coding agents
- [ ] A record of each round's results and artifacts
- [x] Linux desktop builds (0.6.9)
- [ ] WSL workspaces

Ideas are welcome in [Issues](https://github.com/noeigenstate/project-grid/issues). If Project Grid is useful to you, a ⭐ star helps others find it.

## Development

```powershell
git clone https://github.com/noeigenstate/project-grid.git
cd project-grid
npm ci
npm start              # run in development
npm test               # unit tests
npm run test:desktop   # real desktop interaction tests
npm run dist           # build the installer
npm run dist:linux     # on Linux, build the AppImage and tar.gz for this machine's architecture
```

Electron · React · TypeScript · xterm.js · node-pty. Every release passes unit tests, desktop tests against the packaged app and Linux SSH integration tests before it is published. The screenshots and the demo in this README are generated from demo projects by `scripts/readme-shots.mjs`.

## License

Project Grid is open source under the [MIT License](LICENSE): you may use, copy, modify, merge, publish, distribute, sublicense and sell it, provided the copyright and permission notices are kept in copies. The software is provided "as is", without warranty of any kind.

---

<p align="center">
  <strong>Let the agents work. Spend your attention where it's needed.</strong><br />
  <a href="https://github.com/noeigenstate/project-grid/releases/latest">Download</a> ·
  <a href="https://github.com/noeigenstate/project-grid/issues">Feedback</a>
</p>
