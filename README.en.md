<p align="center">
  <img src="assets/icon.png" alt="Project Grid" width="88" />
</p>

<h1 align="center">Project Grid</h1>

<p align="center"><strong>An AI editor built for what comes next: you stop writing every line and start directing a whole grid of AI.</strong></p>
<p align="center">Codex and Claude Code work on many projects side by side. They build, report and wait for your call.<br />Windows · macOS · Linux</p>

<p align="center">
  <a href="https://github.com/noeigenstate/project-grid/releases/latest"><img src="https://img.shields.io/github/v/release/noeigenstate/project-grid?style=flat-square&color=ff3d8b&label=release" alt="Latest release" /></a>
  <a href="https://github.com/noeigenstate/project-grid/releases"><img src="https://img.shields.io/github/downloads/noeigenstate/project-grid/total?style=flat-square&color=2ef2ff&label=downloads" alt="Downloads" /></a>
  <img src="https://img.shields.io/badge/Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-8a5bff?style=flat-square" alt="Windows, macOS, Linux" />
  <img src="https://img.shields.io/badge/Codex%20%C3%97%20Claude%20Code-3c7dff?style=flat-square" alt="Codex and Claude Code" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-39ffa0?style=flat-square" alt="MIT License" /></a>
</p>

<p align="center">
  <a href="https://github.com/noeigenstate/project-grid/releases/latest"><strong>⬇️ Download</strong></a> ·
  <a href="#the-next-editor">Idea</a> ·
  <a href="#highlights">Highlights</a> ·
  <a href="#get-started">Get started</a> ·
  <a href="README.md">中文</a>
</p>

<p align="center">
  <img src="docs/images/promo.webp" alt="Project Grid film: six panes run side by side on a neon grid, one lights up and bursts, terminal glyphs regroup into a document, a voice turns into light, red and green shards are kept or dropped, and everything resolves into the Project Grid mark" width="960" />
</p>
<p align="center"><sub>30-second film · <a href="docs/images/promo.mp4">full quality</a></sub></p>

## The next editor

For forty years editors were built around **a file and a cursor**. Now that AI writes the code, what you really manage are **tasks and agents**: which one is thinking, which one is done, which one is stuck waiting for you, and what exactly it changed.

Project Grid redesigns the editor from there:

- **Parallel, not queued.** Every project is a card with a real terminal; Codex and Claude Code work at the same time.
- **Aware, not watched.** It reads the agents' own session records, knows what each round is doing, when it ends and when it needs you, and calls you back with light, a notification and a voice.
- **Rewritten, not copied.** The terminal's character grid is laid out again as a document: answers, tool calls, command results and questions each in their most readable form.
- **Chosen, not swallowed.** Changes come hunk by hunk; keep what you want, revert the rest.

The terminals still run your own `codex` and `claude`, with the keys, settings and behaviour you already know.

## Highlights

### 🧩 Direct every project from one screen

<img src="docs/images/overview.jpg" alt="Overview: six projects; working cards glow blue, finished ones pink, viewed ones green; Codex and Claude Code side by side" width="100%" />

- 🔵 **Blue**: working, leave it be
- 🩷 **Breathing pink, spoken alert**: this round is done and waiting for you
- 🟢 **Green**: seen, ready for the next instruction

State comes from the rounds Codex and Claude Code record themselves, not from guessing how long the terminal has been quiet: a sub-agent finishing doesn't count, a command exiting doesn't count; only the end of the main round does, and each instruction alerts once. Drag cards to reorder, expand one and shrink it back without losing the session or an unsent draft, split a project into several terminals, and keep local and SSH projects on the same grid.

### 📖 The terminal, laid out again

<img src="docs/images/reading-view.jpg" alt="Reading view: the Codex answer laid out as a document with headings, lists, a code block and folded tool calls; the activity pane on the right lists every step" width="100%" />

Switch any Claude Code or Codex conversation to the **reading view**: headings, lists, tables, code blocks with a Copy button, tool calls folded into one line. The box at the bottom writes straight into the real terminal underneath, and the terminal is one click away.

- **CLI output is rendered again, too.** What slash commands such as `/usage`, `/status` and `/context` print is no longer box art: frames go, figures line up in tables, usage becomes progress bars, groups get headings, all set into the conversation and kept there after the dialog closes. Type `/` for every command, `@` to mention a project file.
- **Questions and confirmations become cards.** Permission prompts, pickers like `/model`, and questions from Claude Code (AskUserQuestion) and Codex (Plan mode) are cards you click; what the agent is doing is written at the end of the conversation, as in its CLI, with a timer and Esc to interrupt.

The **activity pane** keeps the round's calls, completions, failures and time at the top; its live feed names each step for what it is (the command as typed, the skill used, the MCP tool called, the files created or changed), and below it are the tasks being worked on and waiting.

### ✅ Keep only what matters

<img src="docs/images/git-review.jpg" alt="Git review: each change shown as git does, removed lines in red, added lines in green, each hunk kept or reverted on its own" width="100%" />

When a round ends, open a changed file from the Git tab and see it the way `git diff` does. **Decide each hunk on its own**: keep it (stage it) or revert it; unstage what you staged, bring back a deleted file. No context switch, no `git add -p` to remember.

### 🎙️ Speak, and it listens

<img src="docs/images/voice.jpg" alt="Voice input: a navy glass microphone window in the middle of the card, with sound waves that follow your voice" width="100%" />

Press **Ctrl+T** and talk to the current terminal; Enter sends. Recognition runs offline on your machine, **audio never leaves it**, and no API key is needed; a high-accuracy model for mixed Chinese and English is available. When a round ends a natural voice reads out the result, or the agent sums it up in a sentence, or a cloud or local model (Ollama, vLLM) does.

### And also

- **Pick up where you left off**: terminals and Codex / Claude Code sessions come back on start, and an interrupted task carries on.
- **SSH projects**: reuse your VS Code Remote-SSH hosts; terminals, files, Git and previews all run over SSH, nothing to download.
- **Files at hand**: a folder tree, an auto-saving editor, previews of images, web pages, video and Markdown; `Ctrl+click` (`⌘+click` on macOS) opens paths and links in the terminal.
- **Clear to read**: dark frosted glass with white text, edges tuned per system and screen density; switch to the **solid** surface for the sharpest text. Two minimal themes, light *Monochrome amber* and dark *White, Black & Amber*, with adjustable terminal font, weight and background transparency.
- **English and Chinese, remappable shortcuts, automatic updates on Windows**, and a guided tour the first time you open it.

## Get started

**You need:** Windows 10 / 11 x64, an Apple silicon Mac (macOS 12 or later), or a 64-bit Linux desktop (x64 / arm64); and at least one of [Codex CLI](https://github.com/openai/codex) or [Claude Code](https://docs.anthropic.com/claude-code), which you can also install from **Settings › Coding agents**.

1. **Install** the build for your system from [Releases](https://github.com/noeigenstate/project-grid/releases/latest) (below).
2. **Add projects** with `Ctrl+Shift+N`: pick one or more folders, or an SSH project.
3. **Give instructions**: run `codex` or `claude` in a card's terminal, say what to do, and get on with something else. Come back when it turns pink.

| System | Download | Notes |
| --- | --- | --- |
| **Windows** | `Project-Grid-Setup-<version>-x64.exe` | Updates itself |
| **macOS** | Run the command below in Terminal | The same command installs and updates; the app is signed ad hoc, not notarized |
| **Linux** | `Project-Grid-<version>-linux-<arch>.AppImage` | `chmod +x` and run; a `.tar.gz` is also available |

```bash
curl -fsSL https://raw.githubusercontent.com/noeigenstate/project-grid/main/scripts/install-macos.sh | bash
```

A specific version, manual installs, and terminal and shortcut details for macOS and Linux are in the [usage guide](docs/usage.md#安装细节) (Chinese).

<details>
<summary><strong>Shortcuts</strong> (all remappable in Settings; macOS also uses Control)</summary>

| Shortcut | Action |
| --- | --- |
| `Ctrl + Shift + N` | Add projects |
| `Ctrl + Shift + Enter` | Expand or restore the current project |
| `Ctrl + Shift + G` | Back to the overview |
| `Ctrl + Tab` / `Ctrl + Shift + Tab` | Next / previous project |
| `Ctrl + Shift + T` | New terminal in the current project, split |
| `Ctrl + T` | Voice input; Enter sends, Esc cancels |
| `Ctrl + Shift + F` | Search projects |
| `Ctrl + B` | Show or hide the folder sidebar |
| `F11` | Full screen |
| `Ctrl + ,` | Settings |

</details>

## FAQ

<details>
<summary><strong>Is my code or data uploaded?</strong></summary>

Project Grid itself **collects nothing and sends no analytics**. It only contacts GitHub (update checks) and Hugging Face or its mirror (the first download of the offline voice model). Only if you choose a cloud model for spoken summaries is a round's final reply sent to the provider you picked. Codex and Claude Code talk to their own services exactly as they do in any terminal.

</details>

<details>
<summary><strong>How is this different from a few terminals in an IDE?</strong></summary>

The terminals are the same; the difference is that Project Grid **knows what state each agent is in**. It reads the session records of Codex and Claude Code to tell working, done and interrupted apart, and lays answers, command results and changes out for you to read. It is designed for directing several AI tasks at once, not for one person editing one file.

</details>

<details>
<summary><strong>Does it change my Codex / Claude Code configuration?</strong></summary>

No. The settings for completion alerts are passed in at launch and never written to your configuration; your own hooks and settings keep working.

</details>

## Roadmap

- [ ] Project groups and quick switching
- [ ] More command-line coding agents
- [ ] A record of each round's results and artifacts
- [ ] WSL workspaces

Ideas are welcome as [issues](https://github.com/noeigenstate/project-grid/issues). If it helps you, a ⭐ helps others find it.

## Development

```bash
git clone https://github.com/noeigenstate/project-grid.git
cd project-grid
npm ci
npm start              # run in development
npm test               # unit tests
npm run test:desktop   # real desktop interaction tests
npm run dist           # Windows installer (dist:mac on macOS, dist:linux on Linux)
```

Electron · React · TypeScript · xterm.js · node-pty. Every release passes the unit tests, packaged desktop tests and a Linux SSH integration test first. Screenshots come from `scripts/readme-shots.mjs` on demonstration projects; the film is rendered frame by frame from `scripts/promo/`.

## License

[MIT](LICENSE).

---

<p align="center">
  <strong>Let AI do the work. Keep your attention for where it is needed.</strong><br />
  <a href="https://github.com/noeigenstate/project-grid/releases/latest">Download</a> ·
  <a href="https://github.com/noeigenstate/project-grid/issues">Feedback</a>
</p>
