# Ghost

A discreet macOS screen co-pilot. Ghost is a floating, translucent, always-on-top overlay that is excluded from screen shares and recordings. On demand (or automatically when it hears a question) it looks at your screen, listens to the conversation, grounds itself in your uploaded CV, and streams an answer from an [OpenRouter](https://openrouter.ai) model.

Bring your own OpenRouter key. There is no backend: everything runs on your machine.

> **Use responsibly.** Using an assistant like this in interviews, exams or meetings may break employer, school or platform rules. That call is yours.

## Features

- **Hidden overlay**: frameless, always-on-top across all Spaces and full-screen apps, with `setContentProtection(true)` so capture APIs omit it. Menu bar tray, no Dock icon.
- **Models from your key**: nothing is hardcoded. Saving your OpenRouter key loads the models you can use, filtered to those that accept text and screenshots and stream text back. One model serves every mode; if none is chosen, the cheapest paid model with a decent context window is picked.
- **Modes**: Interview, Meeting, Sales, Custom, each with an editable system directive.
- **Live transcript and auto-answer**: continuous speech-to-text with question detection. Interviewer audio (system output) and your mic are captured separately; only the interviewer can trigger answers. Engines: an audio-capable model on your OpenRouter account (default, no extra key), Groq Whisper, OpenAI Whisper, or a local Whisper HTTP endpoint.
- **CV / document grounding**: drop a PDF, TXT or Markdown file on the overlay. Answers are told to stay within it.
- **Follow-ups**: type a follow-up under any answer.
- **Stop / Pause / Clear**: `Esc` halts generation and keeps partial output; Pause silences auto-triggers.
- **Token-conscious**: screenshots are capped at 1280px and skipped for spoken questions that don't refer to the screen; replies are capped at 1000 tokens with low reasoning effort; documents are whitespace-collapsed and capped.

## Hotkeys

| Shortcut | Action |
| --- | --- |
| `⌘⇧Space` | Show / hide overlay |
| `⌘↵` | Ask (screenshot + transcript) |
| `⌘⇧⌫` | Clear |
| `Esc` | Stop generation |
| `⌘` + arrow keys | Move the overlay |

## Download

Grab the installer for your OS from [Releases](https://github.com/anaslari23/ghost/releases). Builds are **unsigned**:

| OS | File | First launch |
| --- | --- | --- |
| macOS | `Ghost-<version>-mac-arm64.dmg` (Apple Silicon) or `-x64.dmg` (Intel) | Right-click the app, choose Open. Allow Screen Recording and Microphone. |
| Windows | `Ghost-<version>-win-setup-x64.exe` (installer) or `Ghost-<version>-win-x64.exe` (portable) | SmartScreen: More info, then Run anyway. |
| Linux | `Ghost-<version>-linux-x86_64.AppImage` or `Ghost-<version>-linux-amd64.deb` | `chmod +x` the AppImage and run it. |

Platform notes: macOS is the primary target. On Windows the overlay is hidden from capture and system audio is captured. On Linux, hiding the overlay from screen capture and capturing system audio are not supported, so use the mic or a Groq/OpenAI engine and treat it as best effort.

### Releasing

Pushing a tag like `v1.0.1` runs `.github/workflows/release.yml`, which builds all three platforms and publishes a GitHub release. `ci.yml` typechecks, tests and builds on every push and pull request.

## Getting started

Requires macOS (Apple Silicon or Intel), Node 20+.

```bash
npm install
env -u ELECTRON_RUN_AS_NODE npm run dev
```

1. Open **Settings** (gear icon), paste your OpenRouter key and press Save. The model list loads; pick one.
2. Grant **Screen Recording** and **Microphone** permission when macOS asks.
3. Optionally drop your CV onto the overlay.

### Build a local app

```bash
npm run build:unpack
cp -R dist/mac-arm64/Ghost.app /Applications/
```

The build is unsigned. Signing and notarization are only needed if you distribute it.

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run with hot reload |
| `npm run build` | Typecheck and build |
| `npm run typecheck` | Typecheck main and renderer |
| `npm test` | Vitest unit tests |
| `npm run lint` / `npm run format` | ESLint / Prettier |

## Architecture

```
src/main/      Electron main process: window, tray, global hotkeys, screen capture, IPC
src/preload/   Typed bridge exposed to the renderer
src/shared/    Types and IPC channel names
src/renderer/  React UI
  services/openrouter.ts     model list, key storage, SSE streaming
  services/transcription.ts  live audio capture, STT engines, question detection
  services/documents.ts      PDF/TXT/MD parsing and prompt context
```

## Privacy and security

- Your OpenRouter key, STT keys and documents are stored in the app's local storage on your machine and sent only to the providers you choose (OpenRouter, and Groq/OpenAI if selected). Nothing is sent to any server of ours.
- Screenshots and transcript text are sent to the model you select.
- Capture exclusion depends on the capturing app. Newer macOS versions and some conferencing apps use ScreenCaptureKit paths that may not honor it; test with Zoom, Meet, Teams and QuickTime before relying on it.

## Status

- [x] Overlay, capture exclusion, tray, hotkeys
- [x] OpenRouter client, model discovery, stop/pause, document grounding
- [x] Live transcript and auto-answer
- [x] Modes and typed follow-ups
- [ ] System-audio loopback for headphone users (ScreenCaptureKit or a virtual device)
- [ ] Hotkey rebinding, session cost meter, speaker labels
- [ ] Signing and notarization

See [REQUIREMENTS.md](REQUIREMENTS.md) for the original spec.
