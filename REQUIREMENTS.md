# cluely-rev: Requirements & Plan

A clone of Cluely's core behavior: a floating, screen-share-invisible overlay that sees your screen, hears the call, and streams AI suggestions in real time. LLM calls go through OpenRouter.

Status: all v1 decisions made (section 8). Ready for P0.

## 1. Goals
- G1. Always-on-top translucent overlay that does not appear in screen shares or recordings.
- G2. Live transcription of system audio (the other party) and the mic (you).
- G3. One hotkey sends the screen plus recent transcript to an LLM and streams an answer into the overlay.
- G4. Model-agnostic via OpenRouter, so the user can swap models without code changes.
- G5. Usable in under 5 minutes: paste a key, press a hotkey.

## 2. Non-goals (v1)
- Accounts, billing, cloud sync, or any backend of our own.
- Windows/Linux support (v1 is macOS only).
- Mobile.
- Stealth against proctoring software or process-level detection. The aim is invisibility to screen capture only.
- Session history across restarts (v1.1).

## 3. Functional requirements

### Overlay window
- F1. Frameless, transparent, always-on-top, visible on all spaces and over fullscreen apps.
- F2. Excluded from screen capture (macOS `NSWindow.sharingType = .none`, which Electron exposes as `win.setContentProtection(true)`).
- F3. Click-through by default. Becomes interactive on a hotkey or hover over its controls.
- F4. Hidden from Dock and app switcher (accessory app). Tray icon for quit and settings.
- F5. Global hotkeys, all rebindable:
  - Toggle show/hide.
  - Ask (screenshot plus transcript).
  - Clear.
  - Move the window with arrow keys.

### Capture
- F6. Screenshot of the active display on demand, downscaled to a configured max edge before sending.
- F7. System audio capture (what the other party says). On macOS this needs ScreenCaptureKit or a loopback device.
- F8. Microphone capture, labelled "You" vs "Them" in the transcript.
- F9. Speech-to-text per utterance (local `mlx-whisper`, VAD-segmented), with a rolling transcript buffer, last N minutes configurable.

### AI
- F10. Chat completion through OpenRouter, streamed token by token.
- F11. Vision input: the screenshot is sent as an image part. Default model supports vision. If the user picks one that does not, send text only.
- F12. Modes (system prompts): Interview, Meeting, Sales, Custom. Switchable from the overlay.
- F13. Follow-up questions typed into the overlay keep conversation context until Clear.
- F14. Auto "what should I say?" suggestion triggered by a pause after the other party finishes speaking (opt-in).

### Settings
- F15. OpenRouter API key, stored in the macOS Keychain, never in plain files or logs.
- F16. Model per mode. Each mode (Interview, Meeting, Sales, Custom) has its own model setting.
  - The picker lists OpenRouter models fetched from `/api/v1/models`, showing price and a vision badge, with search. Any model id can also be pasted.
  - Defaults: all modes use `anthropic/claude-haiku-5.5`. A global "default model" applies to any mode left unset.
  - Switching mode in the overlay switches model automatically. The active model is shown in the overlay.
  - Per-mode settings live in one `modes` object: `{ name, systemPrompt, model, maxScreenshotEdge }`, so the prompt and model are edited together.
- F17. Overlay opacity, font size, position.
- F18. Transcript retention toggle. Off by default, memory only.

## 4. Non-functional requirements
- N1. First token under 2 s p50 after the Ask hotkey on a fast model.
- N2. Idle CPU under 3%. Audio capture must not drop frames.
- N3. Nothing leaves the machine except calls to OpenRouter. Audio is transcribed locally.
- N4. Permissions requested just-in-time with a clear explanation: Screen Recording, Microphone, Accessibility if needed.
- N5. Crash-safe. A capture failure must not kill the overlay.

## 5. Technical approach (proposed)
| Concern | Choice | Why |
|---|---|---|
| Shell | Electron + TypeScript | Content protection and click-through are one-liners, and Cluely itself is Electron. |
| UI | React + Vite, small CSS | Simple and quick to build. |
| LLM | OpenRouter `/chat/completions`, SSE streaming | Already have a key. |
| STT | `mlx-whisper` in a small local Python sidecar (model `mlx-community/whisper-small.en-mlx`) | DECIDED (zero budget). Free, offline, no extra key, runs on the Apple Silicon GPU via MLX. Not true streaming: audio is cut into utterances by a simple energy VAD and each is transcribed when it ends, so expect about 1 to 2 s lag. Provider sits behind `transcribe(wav)` so Deepgram or whisper.cpp can be swapped in later. |
| System audio | ScreenCaptureKit via a small native helper, or `desktopCapturer` loopback | Electron-only audio loopback on macOS is limited. |
| Storage | `electron-store` plus Keychain via `keytar` or `safeStorage` | Minimal. |

## 6. Phased plan
1. **P0: Skeleton (½ day).** Electron app, transparent always-on-top window, content protection, tray, global hotkey toggle. Done when the window is visible to you and absent from a Zoom or QuickTime screen share.
2. **P1: Ask with screenshot (½ day).** Includes the per-mode model picker (F16). Hotkey takes a screenshot and streams an OpenRouter answer into the overlay. Key in settings. Done when asking about the current screen works end to end.
3. **P2: Audio and transcript (1–2 days).** Mic and system audio, streaming STT, rolling transcript. The Ask request now includes the transcript. This is the riskiest phase, so spike it first.
4. **P3: Modes and follow-ups (½ day).** System prompts, typed follow-ups, Clear.
5. **P4: Polish.** Click-through toggling, opacity, auto-suggest on pause, permissions flow, local build packaging.
6. **P5 (only if sharing it):** code signing, notarization, auto-update.

## 7. Risks
- **System audio on macOS** is the hardest part. ScreenCaptureKit audio needs macOS 13+ and the Screen Recording permission.
- **Capture exclusion varies by app.** Newer macOS (15+) and some conferencing apps use ScreenCaptureKit paths that may not honor `sharingType`. Test against Zoom, Meet, Teams and QuickTime.
- **Latency stacking** from STT, then LLM, then render. Stream everything and keep the screenshot small.
- **Terms of service.** Using this in interviews or exams may break employer, school or platform rules. Your call, but worth knowing.

## 8. Decisions
1. ~~Platform~~ DECIDED: macOS only.
2. ~~STT~~ DECIDED: `mlx-whisper` local sidecar (zero budget). Deepgram is an optional later add-on.
3. ~~Models~~ DECIDED (selectable per mode, F16; these are the defaults) (prices per 1M tokens in/out, checked against the OpenRouter models API):
   - Default, text and vision: `anthropic/claude-haiku-5.5` ($0.10/$0.50, 1M context). It handles screenshots, so no separate vision model is needed.
   - "Think harder" upgrade: `anthropic/claude-sonnet-5.5` ($2/$10). Selectable in settings, not the default.
   - **Zero-budget option:** `google/gemma-4-31b-it:free` (vision, 262k context) or `google/gemma-4-26b-a4b-it:free`. Free models are rate limited and can be slow or go away, so treat them as a fallback for when credit runs out. The picker must support a "free only" filter (`:free` suffix).
   - Fallback if Haiku quality disappoints: `google/gemini-3.7-flash` ($0.75/$3.75).
   - Model ids live in one config constant. Re-check the list before P1, since OpenRouter ids change often.
4. ~~Primary use case~~ DECIDED: interviews (coding and behavioral) first. It is the clearest loop, since the other party speaks and you answer, and it maps directly onto separate "Them" vs "You" audio streams. The Interview prompt is tuned in P1/P3. Meeting and Sales prompts ship as untuned stubs.
5. ~~Distribution~~ DECIDED: personal use first.
   - Bring your own OpenRouter key, no backend, so nothing to host.
   - Run unsigned from `npm start` or a local build.
   - Designed so distribution is possible later: keys in the Keychain and no hardcoded secrets.
   - Signing, notarization and an auto-updater are deferred and become a P5 only if you decide to share it.

## 9. Still open
None blocking P0. Revisit the model choice after the first real interview-style test in P1.
