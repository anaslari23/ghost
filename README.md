# Ghost

**A discreet screen co-pilot for interviews, meetings and sales calls.** Ghost is a floating, translucent, always-on-top overlay that screen shares and recordings can't see. It listens to the other side of the call, reads your screen when it matters, draws on your CV, and streams a tailored answer from any [OpenRouter](https://openrouter.ai) model.

Bring your own OpenRouter key. There is no backend: everything runs on your machine.

> **Use responsibly.** Using an assistant like this in interviews, exams or meetings may break employer, school or platform rules. That call is yours.

## Download

Get the installer for your OS from [Releases](https://github.com/anaslari23/ghost/releases/latest). Builds are **unsigned**.

| OS | File | First launch |
| --- | --- | --- |
| macOS | `Ghost-<version>-mac-arm64.dmg` (Apple Silicon) or `-mac-x64.dmg` (Intel) | Right-click the app, choose Open. Allow Screen Recording and Microphone. |
| Windows | `Ghost-<version>-win-setup-x64.exe` (installer) or `Ghost-<version>-win-x64.exe` (portable) | SmartScreen: More info, then Run anyway. |
| Linux | `Ghost-<version>-linux-x86_64.AppImage` or `Ghost-<version>-linux-amd64.deb` | `chmod +x` the AppImage and run it. |

macOS is the primary target. On Windows the overlay is hidden from capture and system audio is captured. On Linux, hiding the overlay from capture and capturing system audio are not supported, so use the mic or a Groq/OpenAI engine and treat it as best effort.

## How it works

1. Add your OpenRouter key in **Settings**. Ghost loads the models your key can use (only those that accept text and screenshots) and picks a sensible default. One model serves every mode.
2. Add your **CV** (PDF, TXT or Markdown). It is condensed once into a compact fact sheet that is reused on every request.
3. Optionally set a **Target** (role, company, notes), for example "SWE II at Google", so answers are framed for that interviewer without inventing CV facts.
4. Press **Start**. Ghost transcribes the interviewer's audio, decides whether something needs an answer, and streams one into the overlay. Press **Pause** to silence it. Your conversation stays on screen.

## Features

- **Hidden overlay.** Frameless, always on top across Spaces and full-screen apps, excluded from capture (`setContentProtection`). Tray icon, no Dock icon.
- **One Start/Pause switch.** No hotkey needed. "Ask now" (⌘↵) is the manual fallback, and a text box lets you type a question or follow-up at any time.
- **Models from your key, no hardcoding.** Browse by provider (Claude, OpenAI, Google, ...) and search. Routers and non-chat models are filtered out.
- **Modes.** Interview, Meeting, Sales and Custom each have an editable directive. Interview answers are built from your CV (relevant experience retold with its numbers, never pasted), STAR for behavioral questions, approach and complexity for coding.
- **Multiple CVs.** Keep several documents (a CV per job, a job description, product notes) and switch each one on or off.
- **Live audio.** The interviewer's audio (system output) and your mic are captured separately. Only the interviewer can trigger answers, and only real questions or requests do. Transcription runs through an audio-capable model on your OpenRouter account, or Groq Whisper, OpenAI Whisper or a local Whisper endpoint (Settings → Audio).
- **Stays quiet when it should.** Small talk and statements get no answer.
- **Conversation thread.** Earlier answers stay above the newest one with their question, and survive pausing, mode switches and restarts. Clear wipes them.
- **Token-conscious.** Condensed CV, stable cacheable system prompt (Anthropic and Gemini prompt caching), screenshots capped at 1280px and sent only when the question refers to the screen, short rolling memory, capped replies.

## Hotkeys

| Shortcut | Action |
| --- | --- |
| `⌘⇧Space` | Show / hide overlay |
| `⌘↵` | Ask now (screen + latest speech) |
| `⌘⇧⌫` | Clear |
| `Esc` | Stop generation |
| `⌘` + arrow keys | Move the overlay |

## Development

Requires Node 20+.

```bash
npm install
env -u ELECTRON_RUN_AS_NODE npm run dev
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run with hot reload |
| `npm run typecheck` | Typecheck main and renderer |
| `npm test` | Vitest unit tests |
| `npm run build:unpack` | Unpacked local build in `dist/` |
| `npm run build:mac` / `build:win` / `build:linux` | Platform installers |

```
src/main/      Electron main process: window, tray, hotkeys, screen capture, IPC
src/preload/   Typed bridge to the renderer
src/shared/    Types and IPC channel names
src/renderer/  React UI
  services/openrouter.ts     models, key storage, streaming
  services/transcription.ts  audio lanes, STT engines, question detection
  services/documents.ts      PDF/TXT/MD parsing and condensing
  services/brief.ts          optional target role/company context
```

### Releasing

Pushing a tag like `v1.0.2` runs `.github/workflows/release.yml`, which builds macOS, Windows and Linux installers and publishes a GitHub release. Bump `version` in `package.json` first, since file names include it. `ci.yml` typechecks, tests and builds on every push and pull request.

## Privacy and security

- Your OpenRouter key, any Groq/OpenAI key and your documents are stored in the app's local storage on your machine and sent only to the providers you choose. Nothing goes to a server of ours.
- Screenshots, transcribed speech, your condensed CV and Target are sent to the model you select. Audio clips go to the transcription engine you select.
- Capture exclusion depends on the capturing app. Newer macOS versions and some conferencing apps use paths that may ignore it. Test with Zoom, Meet, Teams and QuickTime before relying on it.

## Roadmap

- [ ] Hotkey rebinding and a session cost meter
- [ ] Streaming transcription for lower latency
- [ ] Code signing and notarization

## License

[MIT](LICENSE)
