# Glimpse

A macOS screenshot + AI chat tool. Capture any region of your screen, annotate it, and have an AI conversation about what you see.

## Features

- **Screenshot Mode** (`Cmd+Shift+Z`) — Fullscreen overlay with drag-to-select region capture
- **Chat Mode** (`Cmd+Shift+C`) — Standalone AI chat with automatic text context capture
- **Annotation Tools** — Rectangle, ellipse, arrow, line, pen, text, and mosaic/blur
- **AI Chat** — Ask questions about your screenshot or any topic (Claude Haiku 4.5 / Gemini 2.5 Flash)
- **Pin to Screen** — Detach the chat window and pin it on top of other windows
- **Thread Management** — Conversation history with automatic title generation
- **Image Export** — Copy to clipboard or save annotated screenshots

## Tech Stack

- Electron + React + Vite
- Anthropic Claude API / Google Gemini API
- Canvas-based annotation with hit testing
- Native macOS window management (CGWindowList via Swift helper)

## Getting Started

### Prerequisites

- macOS
- Node.js 18+
- At least one API key: [Anthropic](https://console.anthropic.com/) or [Google AI](https://aistudio.google.com/)

### Setup

```bash
git clone https://github.com/yifuwu/glimpse.git
cd glimpse
npm install
cp .env.example .env
# Edit .env with your API key(s)
```

### Development

```bash
npm run electron:dev
```

### Build

```bash
npm run dist
```

The `.dmg` will be in the `dist/` folder.

## Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+Z` | Screenshot mode |
| `Cmd+Shift+C` | Chat mode (captures selected text) |
| `Esc` | Close overlay / chat window |

## License

MIT
