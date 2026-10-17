# Store screenshots, promotional tiles and demo video

Five 1280×800 RGB PNGs show the real extension UI on a fictional Northwind website, using only a dummy vault and companion. The browser frame, website and explanatory copy are part of the demo page; the menus are rendered and operated by the built extension. No real Apple account, passwords, Contacts or iCloud requests are used.

| Asset | Shows |
|---|---|
| [01 — Sign in](images/store/01-inline-signin-light.png) | Choosing from saved Apple Passwords logins |
| [02 — Dark mode](images/store/02-inline-signin-dark.png) | The actual menu's dark appearance |
| [03 — Generate a password](images/store/03-generate-password.png) | Strong and alphanumeric password suggestions |
| [04 — Email suggestions](images/store/04-email-suggestions.png) | Mock iCloud alias and contact-card suggestions, with their optional requirements disclosed |
| [05 — Save a login](images/store/05-save-to-apple-passwords.png) | The actual “Strong Password Saved” confirmation after the fake helper saves the generated login |
| [Small promo tile](images/store/06-small-promo-tile.png) | 440×280 branded tile |
| [Marquee promo tile](images/store/07-marquee-promo-tile.png) | 1400×560 branded artwork with a crop of the real extension screenshot |
| [Sign-in demo](videos/store/signin-demo.webm) | A 10.6-second silent recording of selecting a login, filling the form, and signing in to the fictional site |

The screenshots contain no alpha channel and meet Chrome's 1280×800 requirement. The video is 1280×800 VP9 WebM at 25 fps. Chrome's promotional video field takes a YouTube URL, so the recording has to be uploaded there to appear on the listing.

## Recreate the media

On macOS with Helium installed:

```sh
bun run --filter @app/extension capture:store
```

To use another installed Chromium-compatible executable, set `STORE_MEDIA_BROWSER_EXECUTABLE` to its absolute path before running the command. The capture uses a fresh temporary profile with the local fake native hosts and removes it afterwards. It never opens the user's ordinary browser profile and does not use Google Chrome for Testing by default.

Sources: `apps/extension/media/demo.html`, `apps/extension/media/capture.spec.ts`, `apps/extension/media.config.ts`, and the existing fake-helper fixtures. Media capture is separate from the normal end-to-end suite.

The capture verifies that login suggestions render, generated passwords can be selected and saved through the fake helper, email suggestions appear, and the recorded login fills the expected dummy username and password. It is a demo/integration check, not a live Apple service test.

## Promotional artwork

The small and marquee tiles use the existing SVG key icon, the screenshot set’s colors, and the headline “Apple Passwords. In your browser.” Both are opaque 24-bit RGB PNGs, used on the Chrome Web Store listing. The marquee shows a crop of the actual demo screenshot, with sample credentials.

Editable layout: `apps/extension/media/promo.html`; renderer: `apps/extension/media/promo.spec.ts`. To regenerate only the two tiles, run `bunx playwright test --config media.config.ts promo.spec.ts` from `apps/extension`. The full `capture:store` command also regenerates them.

The Firefox Add-ons listing shows the same five screenshots, with captions, and the 128px icon.
