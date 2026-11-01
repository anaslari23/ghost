<div align="center">

# Ghost

**F*ck Cluely and its subscription. Add your API key and go.**

A free, open-source AI copilot for interviews, meetings and sales calls.
Invisible to screen share. Pay only for the tokens you use.

[Download](https://github.com/anaslari23/ghost/releases/latest) · [MIT License](LICENSE)

</div>

---

Cluely and its alternatives charge a monthly subscription for what is, underneath, an LLM call. Ghost is the same idea without the middleman: drop in your [OpenRouter](https://openrouter.ai) key, pick any model, and it works. No account, no backend, nothing leaves your machine except the requests you choose to send.

## Get started

1. **Download** the installer for your OS from [Releases](https://github.com/anaslari23/ghost/releases/latest).
2. Open **Settings**, paste your OpenRouter key. Your models load automatically.
3. Drop in your **CV**. Optionally set a role and company in **Target**.
4. Hit **Start**.

| OS | File |
| --- | --- |
| macOS | `Ghost-<version>-mac-arm64.dmg` (Apple Silicon) / `-mac-x64.dmg` (Intel) |
| Windows | `Ghost-<version>-win-setup-x64.exe` or the portable `-win-x64.exe` |
| Linux | `Ghost-<version>-linux-x86_64.AppImage` or `-linux-amd64.deb` |

Builds are unsigned. macOS: right-click, Open. Windows: More info, Run anyway. Linux: `chmod +x` the AppImage. macOS is the best supported; on Linux the overlay can't hide from capture.

## What it does

- **Invisible overlay.** Floats above everything, excluded from screen shares and recordings.
- **Listens for you.** Hears the interviewer, ignores small talk, and answers real questions on its own.
- **Knows your CV.** Retells your actual experience for the question, in your voice. No pasted bullet points. Keep several CVs and switch between them.
- **Any model.** Browse everything your key can use, by provider. One model for every mode.
- **Four modes.** Interview, Meeting, Sales, Custom.
- **Cheap to run.** Condensed CV, prompt caching and screenshots only when needed keep token use low.

## Hotkeys

| Shortcut | Action |
| --- | --- |
| `⌘⇧Space` | Show / hide |
| `⌘↵` | Ask now |
| `⌘⇧⌫` | Clear |
| `Esc` | Stop |

## Build from source

```bash
npm install
env -u ELECTRON_RUN_AS_NODE npm run dev
```

Push a `v*` tag to build and publish all three platforms via GitHub Actions.

## License

[MIT](LICENSE)
