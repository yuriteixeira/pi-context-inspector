# pi-context-inspector

PS: *Forked from the extinct https://github.com/YuGiMob/pi-context-inspector*

Opens a tabbed overlay with the full LLM context of the current session in [pi-coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent): token breakdown, system prompt, active tools, every message, and a complete context dump.

## What you get

- **One command, five views.** `/context` opens a centered overlay with Stats, System, Tools, Messages and Full tabs.
- **Token breakdown that matches reality.** Raw character-based estimates are scaled to the provider-reported token count, so category percentages are proportional to the real usage — not to a guess.
- **A visual usage grid.** A 10×5 colored grid (50 blocks, 2% each) shows at a glance how much of the context window is system prompt, tools, skills, messages, available space, and the auto-compact buffer.
- **Scroll, search, copy, or inspect in an editor.** Every content tab supports vim style scrolling, live `/` search with match navigation, `y` to copy the raw text, and `e` to open a snapshot in `$EDITOR`.
- **Skill-aware accounting.** Tool calls that read skill files (`.agents/skills/`, `.pi/agent/*/skills/`, `skills/*/SKILL.md`) are counted under Skills instead of Tools.

## Quick start

Run `/context` at any point during a session:

```text
/context
```

The overlay opens with the Stats tab active. `Tab` / `Shift+Tab` cycles tabs, `q` or `Escape` closes the overlay. On System, Tools, Messages, or Full, press `e` to open that view in `$EDITOR`. Pi resumes when the editor exits. Any edits to the temporary file are discarded and do not change the session. Stats and Skills do not have editor views; Skills is a category in Stats, not a separate tab.

## Installation

```bash
pi install npm:pi-context-inspector
```

From a local checkout:

```bash
pi install /path/to/pi-context-inspector
```

## The tabs

| Tab | Shows |
| --- | --- |
| **Stats** | Model name, token usage vs. context window (with percent), a 10×5 colored usage grid, a per-category breakdown (system prompt, system tools, tools, skills, messages, available, auto-compact buffer), and safe-left tokens. |
| **System** | The full system prompt, line-numbered, scrollable and searchable. |
| **Tools** | Active tool definitions with their parameter schemas (required vs. optional, descriptions). |
| **Messages** | All session messages formatted with roles, model, token usage, stop reasons, tool calls, image placeholders and errors. |
| **Full** | Complete context dump: system prompt + messages + context usage, ready to copy. |

## Keyboard

| Key | Action |
| --- | --- |
| `Tab` / `Shift+Tab` | Cycle tabs |
| `↑` / `↓`, `j` / `k` | Scroll |
| `g` / `G` | Jump to top / bottom |
| `PgUp` / `PgDn`, `Ctrl+b` / `Ctrl+f`, `Ctrl+u` / `Ctrl+d` | Page scroll |
| `/` | Live search (type, `Enter` to commit) |
| `n` / `N` | Next / previous match |
| `y` | Copy the tab's raw text to the clipboard |
| `e` | Open the current text tab in `$EDITOR` |
| `q` / `Escape` | Close the overlay |

## How the token breakdown works

Each category is estimated from raw text (chars ÷ 4, using pi's own per-message token estimator so thinking and image content are counted), then all estimates are scaled by a single ratio so they sum to the provider-reported token count. The grid reserves the auto-compact buffer as its own segment; the remaining blocks are filled proportionally by category. `safeAvailable` is the context window minus the reserve minus current usage — when it hits zero, the overlay reports that the auto-compact threshold has been reached.

## Troubleshooting

- **"No context usage data available."** Send a message first, then re-open `/context` — usage is only reported once a turn has run.
- **The overlay doesn't open.** `/context` requires interactive (TUI) mode; it is a no-op when `ctx.hasUI` is false.
- **The editor doesn't open.** Set `$EDITOR` to a terminal editor command, such as `vim` or `code --wait`. The command must stay open until you finish viewing the file.
- **Percentages look off.** The breakdown scales estimates to the provider's reported total, so category sizes are proportional — but the provider total itself is only as accurate as the provider's usage reporting.

## Development

Requires [Node.js](https://nodejs.org) ≥ 22.19 and npm.

```bash
npm install
npm test
npm run typecheck
```

## Credits

- [badlogic](https://github.com/badlogic), pi-coding-agent and the TUI APIs this overlay is built on
- [Agnish Chakraborty](https://github.com/agnishcc), author of [@agnishc/edb-context-viewer](https://github.com/agnishcc/pi-extention-monorepo/tree/main/packages/edb-context-viewer) — this package is a fork of that extension

## License

[MIT](LICENSE)
