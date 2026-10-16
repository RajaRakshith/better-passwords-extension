// Landing-page sections rendered into <div data-common="…">.
// Must run before browser.js configures the setup buttons.
(() => {
  const B = `<span data-browser>Chrome</span>`;
  const I = {
    field: '<rect x="3" y="6" width="18" height="6" rx="2"/><path d="M6 16h9M6 19.5h6"/>',
    mail: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
    dots: '<rect x="3" y="8" width="18" height="8" rx="2.5"/><path d="M7 12h.01M10.5 12h.01M14 12h.01M17.5 12h.01"/>',
    person: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    print:
      '<path d="M12 4a8 8 0 0 0-8 8M12 4a8 8 0 0 1 8 8v1M7.5 19.5A10 10 0 0 0 8 12a4 4 0 0 1 8 0v1.5M12 12v2.5a10 10 0 0 1-2 5.5M16 17a14 14 0 0 1-.8 3"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    open: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 7.5-2"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6Z"/>',
  };

  const appIcon = (id, from, to, hole, plus) => `<svg class="vs-icon" viewBox="0 0 128 128" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
    <rect x="4" y="4" width="120" height="120" rx="28" fill="url(#${id})"/>
    <g fill="#fff"><circle cx="46" cy="64" r="22"/><rect x="60" y="58" width="48" height="12" rx="4"/><rect x="88" y="66" width="10" height="16" rx="3"/><rect x="72" y="66" width="10" height="11" rx="3"/></g>
    <circle cx="40" cy="64" r="8" fill="${hole}"/>
    ${plus ? '<path d="M96 22v14M89 29h14" stroke="#fff" stroke-width="5" stroke-linecap="round"/>' : ""}
  </svg>`;
  const SIX = `<svg class="six" viewBox="0 0 24 24" aria-hidden="true"><text x="12" y="10.6">481</text><text x="12" y="19.4">927</text></svg>`;
  const FP = `<svg viewBox="0 0 24 24" aria-hidden="true">${I.print}</svg>`;

  const blocks = {
    compare: `
      <div class="wrap">
        <h2 class="h2 center reveal">Already using Apple's extension?</h2>
        <p class="lede center reveal d1" style="max-width:32em;margin:0 auto 48px">Both use the same Apple Passwords, so switching loses nothing.</p>
        <div class="vs reveal d2" role="table" aria-label="Apple's iCloud Passwords extension compared with Better Passwords">
          <div class="vs-r vs-head" role="row">
            <span role="columnheader"></span>
            <div class="vs-prod" role="columnheader">${appIcon("vs-them", "#c7c7cc", "#8e8e93", "#aaaab0", false)}<div><b>iCloud Passwords</b><small>Apple's extension</small></div></div>
            <div class="vs-prod" role="columnheader">${appIcon("vs-us", "#3a8dff", "#0060df", "#1774f0", true)}<div><b>Better Passwords</b><small>This extension</small></div></div>
          </div>
          ${[
            [
              "Made by",
              "Apple",
              'An indie developer, <a href="https://github.com/fanckush" target="_blank" rel="noopener">@fanckush</a>',
            ],
            ["Fills your Apple Passwords", "Yes", "Yes"],
            ["Strong passwords for sign-ups", "Opens the Passwords app", "Suggested right in the field", "us"],
            ["Hide My Email in sign-up forms", null, "Yes, with iCloud+", "us"],
            ["Your own emails in sign-up forms", null, "From your contact card*", "us"],
            [
              "Unlocks with",
              { tiles: [["outline", SIX]], text: "Six digits from your Mac" },
              {
                tiles: [
                  ["outline", SIX],
                  ["filled", FP],
                ],
                text: "Six digits, or Touch ID*",
              },
              "us",
            ],
            ["How often", `Each time ${B} puts it to sleep`, `Once, until you quit ${B}`, "us"],
            [
              "Windows",
              "Yes, with iCloud for Windows",
              `Mac only for now. <a href="https://github.com/fanckush/better-passwords-extension/issues/new?title=Windows%20support" target="_blank" rel="noopener">Ask for Windows</a>`,
              "them",
            ],
            ["Price", "Free", "Free and open source", "us"],
          ]
            .map(
              ([label, them, us, win]) => `
          <div class="vs-r" role="row">
            <span class="vs-label" role="rowheader">${label}</span>
            ${[them, us]
              .map((v, i) =>
                !v
                  ? `<div class="vs-v none" role="cell">Not available</div>`
                  : typeof v === "object"
                    ? `<div class="vs-v${win === ["them", "us"][i] ? " win" : ""}" role="cell"><span class="vs-tiles">${v.tiles.map(([style, svg]) => `<span class="vs-tile ${style}">${svg}</span>`).join('<span class="vs-plus" aria-hidden="true">+</span>')}</span><p>${v.text}</p></div>`
                    : `<div class="vs-v${win === ["them", "us"][i] ? " win" : ""}" role="cell"><p>${v}</p></div>`,
              )
              .join("")}
          </div>`,
            )
            .join("")}
        </div>
        <p class="vs-foot reveal">* Needs the free companion Mac app.</p>
      </div>`,

    faq: `
      <div class="wrap">
        <h2 class="h2 center reveal" style="margin-bottom:48px">Questions</h2>
        <div class="faq">
          <details><summary>What is Hide My Email?</summary><p>An iCloud+ feature that gives each site its own random address that forwards to your inbox. If a site sells or leaks it, you turn that one address off. Safari offers it in sign-up forms; this brings it to ${B}, using your iCloud sign-in in this browser.</p></details>
          <details><summary>Is this from Apple?</summary><p>No. It's an independent, open-source extension that works with the Apple Passwords already on your Mac.</p></details>
          <details><summary>Is it safe?</summary><p>Your passwords stay in Apple Passwords. The extension asks your Mac for the one you pick, fills it, and keeps nothing. There are no accounts, no servers and no tracking, and anyone can read the code.</p></details>
          <details><summary>How do I set it up?</summary><p>Add the extension from your browser's store, then open the companion Mac app. It connects ${B} to Apple Passwords and turns on Touch ID. Unlock once, and turn on Hide My Email from the toolbar if you have iCloud+. Needs macOS 14 (Sonoma) or later.</p></details>
          <details><summary>What are the six digits?</summary><p>When an extension connects to Apple Passwords, your Mac shows a six-digit code and you type it into the browser, to prove the browser is yours. Apple's extension needs a new one whenever ${B} puts it to sleep. This extension keeps the connection open for the browser session. With the optional companion app, Touch ID enters the code for you.</p></details>
          <details><summary>Do I need the companion app?</summary><p>It's the easy way, and it's what adds Touch ID and your contact card's emails. Without it, run this once in Terminal:</p><pre>curl -fsSL https://github.com/fanckush/better-passwords-extension/raw/main/scripts/setup-mac.sh | sh</pre></details>
          <details><summary>Does it cost anything?</summary><p>No. The extension and the companion app are free. Hide My Email is part of iCloud+, which you pay Apple for.</p></details>
          <details><summary>Does it work on Windows?</summary><p>Not yet. It's Mac only for now, because it works with the Apple Passwords helper built into macOS. If you'd use it on Windows, <a href="https://github.com/fanckush/better-passwords-extension/issues/new?title=Windows%20support" target="_blank" rel="noopener">open an issue</a> to ask for it.</p></details>
        </div>
      </div>`,

    footer: `
      <div class="wrap">
        <p><a href="https://github.com/fanckush/better-passwords-extension">Source code</a><a href="https://github.com/fanckush/better-passwords-extension/blob/main/PRIVACY.md">Privacy</a><a href="https://github.com/fanckush/better-passwords-extension/blob/main/SECURITY.md">Security</a></p>
        <p>Better Passwords is not affiliated with or endorsed by Apple Inc. Apple, iCloud, iCloud+, Safari and Touch ID are trademarks of Apple Inc.</p>
      </div>`,
  };

  document.querySelectorAll("[data-common]").forEach((el) => {
    el.innerHTML = blocks[el.dataset.common] ?? "";
  });
})();
