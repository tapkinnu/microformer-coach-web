# Microformer Coach Web/PWA

Mobile web version of the Microformer Coach instructor app. This version does **not** require macOS, Xcode, TestFlight, or an Apple Developer account.

## Run from Windows/WSL

From this folder:

```bash
npm test
npm run check:data
npm run serve
```

Then open this on the iPhone while it is on the same network:

```text
http://<your-windows-lan-ip>:8080/
```

If opening from the same WSL machine/browser, use:

```text
http://127.0.0.1:8080/
```

## Install on iPhone Home Screen

1. Open the URL in Safari on the iPhone.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Launch **Microformer** from the Home Screen.

The app includes a web manifest, Apple web-app meta tags, icons, and a service worker. Offline caching activates after the first successful HTTP/HTTPS load. Safari may not register service workers from `file://`, so serve it with `npm run serve` or host it on any static web host.

## Features

- Built-in program library using the same `BuiltInPrograms.json` as the SwiftUI prototype.
- 4 programs / 122 movements.
- Live instructor mode with countdown, movement details, spring settings, cues, corrections, variations, transition notes, upcoming movement, progress bar, and controls.
- Custom program editor with add/edit/delete/reorder segments.
- Custom programs persist in iPhone browser `localStorage`.
- Dark, high-contrast mobile-first UI.

## Files

- `index.html` — app shell and iPhone/PWA meta tags.
- `styles.css` — responsive dark UI.
- `src/app.mjs` — vanilla JS UI/controller.
- `src/programs.mjs` — program normalization and localStorage serialization.
- `src/session.mjs` — live timer/session state machine.
- `data/built-in-programs.json` — copied seed programs.
- `manifest.webmanifest` — PWA manifest.
- `sw.js` — offline cache service worker.
- `tools/check-data.mjs` — data/static sanity checker.
- `test/web-app.test.mjs` — Node test coverage for core behavior.
