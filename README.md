# Instahancer

Instagram Reels Enhancements: HTML5 controller, volume control, RAM saver, and more.

A userscript that restores native `<video>` controls on Instagram, takes control of volume and autoplay, frees memory while scrolling Reels, and turns Likes/Saved grid tiles into openable links.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or Violentmonkey / Greasemonkey).
2. Open the raw script: https://raw.githubusercontent.com/schalkburger/instahancer/main/instahancer.user.js
3. Tampermonkey prompts **Install user script** — confirm.
4. Open https://www.instagram.com/reels/ — the script runs automatically (`document-idle`).

The `GM_config` dependency downloads automatically via `@require`.

Manual install: copy `instahancer.user.js` into your manager's "Create new script" editor and save.

## Features

### Player

- **HTML5 video controls** — native controls forced to the top layer; Instagram's click-mask overlays get `pointer-events: none`, so pause/seek/volume scrubbers actually respond.
- **Volume control** — overrides `HTMLMediaElement.volume`/`muted`; every video opens at your configured volume instead of Instagram's default. Change it in settings, no reload needed.
- **Prevent autoplay** — blocks the first `play`/`playing` event; reels wait for your click.
- **Disable looping** — video pauses at `ended` instead of restarting.
- **Layout unlock** — removes the `[role="main"]` max-width constraints for full-bleed video.

### Reels

- **RAM saver** — on `/reels/` every 2 seconds, any video more than 1000px above the viewport gets paused and its `src`/`<source>` removed from memory. Stops background reels from eating RAM.
- **Click to play/pause** — intercepts Instagram's click navigation on reels; clicking the video toggles playback instead of opening the post.

### Likes / Saved pages

- **Openable grid tiles** — on *Your activity → Likes* and *Saved*, tiles become real links opening in a new tab. Media IDs are decoded from the image's `ig_cache_key` (base64 → BigInt → shortcode), with a React fiber walk as fallback.

## Settings

Tampermonkey toolbar icon → **Instahancer Settings**:

| Setting | Type | Default |
|---|---|---|
| Default Video Volume (0.0 to 1.0) | float | `0.2` |
| Prevent Video Autoplay | checkbox | on |

## Scope

- Matches `https://*.instagram.com/*`
- Excludes `https://*.instagram.com/stories/*/*/` (stories untouched)

## License

MIT
