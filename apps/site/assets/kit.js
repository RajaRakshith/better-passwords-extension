// Interactive landing-page demo, reveal effects and unlock animations.
globalThis.Kit = (() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ICON = "icon.svg";
  const clamp = (n) => Math.min(1, Math.max(0, n));
  const randomCode = () => String(Math.floor(Math.random() * 1e6)).padStart(6, "0");
  const spaced = (code) => `${code.slice(0, 3)} ${code.slice(3)}`;

  // .reveal gets .in once it's on screen.
  function reveal() {
    const els = document.querySelectorAll(".reveal");
    if (reduce || !("IntersectionObserver" in window))
      return els.forEach((e) => {
        e.classList.add("in");
      });
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
      },
      { threshold: 0.25 },
    );
    els.forEach((e) => {
      io.observe(e);
    });
  }

  // Six digits that roll when they change.
  function roller(el, code = randomCode()) {
    el.classList.add("roller");
    el.setAttribute("aria-label", spaced(code));
    el.innerHTML = [...code].map((d, i) => `<span class="d${i === 3 ? " gap" : ""}"><span>${d}</span></span>`).join("");
    const cells = [...el.querySelectorAll(".d > span")];
    return {
      get code() {
        return code;
      },
      set(next = randomCode()) {
        code = next;
        el.setAttribute("aria-label", spaced(code));
        cells.forEach((c, i) => {
          c.textContent = code[i];
          if (!reduce)
            c.animate(
              [
                { transform: "translateY(-70%)", opacity: 0, filter: "blur(4px)" },
                { transform: "none", opacity: 1, filter: "none" },
              ],
              { duration: 520, delay: i * 45, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" },
            );
        });
        return code;
      },
    };
  }

  // A fingerprint: dim ridges plus a lit copy revealed by set(p).
  function print(svg) {
    const NS = "http://www.w3.org/2000/svg";
    svg.setAttribute("viewBox", "0 0 200 200");
    const ring = document.createElementNS(NS, "circle");
    ring.setAttribute("class", "fp-ring");
    Object.entries({ cx: 100, cy: 100, r: 96, pathLength: 1 }).forEach(([k, v]) => {
      ring.setAttribute(k, v);
    });
    svg.append(ring);
    const lit = [];
    // Sized to sit inside the ring (r = 96): the tallest ridge tops out about 20 below the ring.
    const cx = 100,
      cy = 110,
      SQ = 1.24;
    for (let i = 0; i < 8; i++) {
      const r = 7 + i * 8.4;
      const tilt = [0, 18, -14, 26, -22, 10, -30, 6][i];
      const span = [200, 230, 250, 215, 240, 205, 225, 190][i];
      const start = 90 + (360 - span) / 2 + tilt;
      const a0 = (start * Math.PI) / 180,
        a1 = ((start + span) * Math.PI) / 180;
      const d = `M${(cx + r * Math.cos(a0)).toFixed(1)} ${(cy + r * Math.sin(a0) * SQ).toFixed(1)} A${r} ${(r * SQ).toFixed(1)} 0 1 1 ${(cx + r * Math.cos(a1)).toFixed(1)} ${(cy + r * Math.sin(a1) * SQ).toFixed(1)}`;
      for (const on of [false, true]) {
        const p = document.createElementNS(NS, "path");
        p.setAttribute("d", d);
        p.setAttribute("class", on ? "fp-ridge lit" : "fp-ridge");
        svg.append(p);
        if (on) lit.push(p);
      }
    }
    // Each ridge lights from its middle out to both ends, starting at slightly uneven moments,
    // so the print fills in organically rather than sweeping in one direction.
    const lens = lit.map((p) => p.getTotalLength());
    const starts = [0, 0.08, 0.18, 0.05, 0.26, 0.14, 0.32, 0.22];
    const draw = (el, len, f) => {
      const a = len * f;
      el.style.strokeDasharray = `${a} ${len}`;
      el.style.strokeDashoffset = `${-(len - a) / 2}`;
    };
    const api = {
      set(p) {
        svg.style.setProperty("--p", p);
        // The ring grows from the top down both sides (it's rotated to start at the bottom).
        ring.style.strokeDasharray = `${p} 1`;
        ring.style.strokeDashoffset = `${-(1 - p) / 2}`;
        lit.forEach((el, i) => {
          draw(el, lens[i], clamp((p - starts[i]) / 0.62));
        });
      },
    };
    api.set(0);
    return api;
  }

  // Press and hold (pointer, Space or Return) to fill the print; calls done() when full.
  function hold(button, fp, done, { duration = 900 } = {}) {
    let p = 0,
      last = 0,
      holding = false,
      raf = 0;
    const tick = (t) => {
      const dt = last ? t - last : 16;
      last = t;
      p = clamp(p + (holding ? dt / (reduce ? 1 : duration) : -dt / 350));
      fp.set(p);
      if (p >= 1) {
        holding = false;
        button.classList.remove("holding");
        done();
        return;
      }
      if (holding || p > 0) raf = requestAnimationFrame(tick);
      else last = 0;
    };
    const start = () => {
      holding = true;
      last = 0;
      button.classList.add("holding");
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      holding = false;
      button.classList.remove("holding");
    };
    button.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      start();
    });
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("keydown", (e) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat) {
        e.preventDefault();
        start();
      }
    });
    button.addEventListener("keyup", (e) => {
      if (e.key === " " || e.key === "Enter") stop();
    });
    return {
      reset() {
        p = 0;
        last = 0;
        fp.set(0);
      },
    };
  }

  const KEY = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.75a5.25 5.25 0 0 1 1.5 10.28v1.72h1.9a.6.6 0 0 1 .6.6v1.3a.6.6 0 0 1-.6.6h-1.9v.75h1.4a.6.6 0 0 1 .6.6v1.3a.6.6 0 0 1-.6.6h-1.4v.6a.8.8 0 0 1-.23.56l-.7.7a.8.8 0 0 1-1.14 0l-.7-.7a.8.8 0 0 1-.23-.56v-8.15A5.25 5.25 0 0 1 12 1.75Zm0 2.25a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5Z"/></svg>`;
  const PUZZLE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3a2 2 0 0 1 2 2v1h3a1 1 0 0 1 1 1v3h1a2 2 0 1 1 0 4h-1v3a1 1 0 0 1-1 1h-3v-1a2 2 0 1 0-4 0v1H5a1 1 0 0 1-1-1v-3h1a2 2 0 1 0 0-4H4V7a1 1 0 0 1 1-1h3V5a2 2 0 0 1 2-2Z"/></svg>`;
  const MAIL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/></svg>`;
  const PERSON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>`;
  const EYE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const EYE_OFF = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/><path d="m4 4 16 16"/></svg>`;
  const LOGINS = ["jane@example.com", "jane.ops@example.com"];
  const pick = (s) => s[Math.floor(Math.random() * s.length)];
  // Illustrative only: the real addresses and passwords come from iCloud and the extension.
  const hideMyEmail = () =>
    `${pick(["quiet", "brisk", "amber", "lunar", "mossy", "swift", "civic", "olive"])}.${pick(["otter", "fern", "quill", "harbor", "maple", "comet", "pebble", "heron"])}_${Math.random().toString(36).slice(2, 4)}@icloud.com`;
  const strongPassword = () => {
    const a = "abcdefghijkmnopqrstuvwxyz";
    const chars = Array.from({ length: 18 }, () => pick(a));
    chars[Math.floor(Math.random() * 18)] = pick("23456789");
    const up = Math.floor(Math.random() * 18);
    chars[up] = chars[up].toUpperCase();
    const s = chars.join("");
    return `${s.slice(0, 6)}-${s.slice(6, 12)}-${s.slice(12)}`;
  };
  // Keep the first group of a suggested password readable and mask the rest.
  const maskPw = (pw) => {
    const groups = pw.split("-");
    if (groups.length > 1) return [groups[0], ...groups.slice(1).map((g) => "•".repeat(g.length))].join("-");
    return pw.slice(0, 6) + "•".repeat(pw.length - 6);
  };

  // The extension's settings, shared by every popup on the page and kept in this browser.
  const SETTINGS_KEY = "app-demo-settings";
  const settings = { inline: true, signup: true, hme: true, lockOnSleep: false };
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"));
  } catch {}
  const TOGGLES = [
    ["inline", "When signing in", "saved passwords"],
    ["signup", "When signing up", "strong passwords and emails"],
    ["hme", "Hide My Email", "uses icloud.com"],
  ];
  function setSetting(key, value) {
    settings[key] = value;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
    document.dispatchEvent(new CustomEvent("kit:settings", { detail: { key, value } }));
  }
  // The popup's settings part, as in the real popup: Suggestions, then Lock when my Mac locks and Lock.
  function settingsHTML() {
    const toggle = (k, label, detail) =>
      `<label class="dm-pop-toggle"><input type="checkbox" data-setting="${k}" ${settings[k] ? "checked" : ""} /><span>${label}${detail ? `<small>${detail}</small>` : ""}</span></label>`;
    return `<div class="dm-pop-sec"><h5>Suggestions</h5>${TOGGLES.map(([k, l, d]) => toggle(k, l, d)).join("")}</div>
      <div class="dm-pop-foot">${toggle("lockOnSleep", "Lock when my Mac locks", "")}<button type="button" class="dm-pop-lock">Lock</button></div>`;
  }
  function bindSettings(el) {
    el.querySelectorAll("input[data-setting]").forEach((i) => {
      i.addEventListener("change", () => setSetting(i.dataset.setting, i.checked));
    });
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));
  let uid = 0;

  // The interactive browser: a pretend site with a sign-in page and, optionally, a create-account page.
  // Options: locked (start locked), mode ("signin" | "signup"), switchable (show both), hint.
  // Emits demo:ask, demo:unlock, demo:lock, demo:mode, demo:fill (detail.kind: login | hme | me | strong)
  // and demo:submit (detail.mode).
  // Frameless: just the site's card, for a page that is itself the browser. The page then passes its
  // own toolbar button and popup element, and optionally a footer for the popup.
  function demo(
    root,
    {
      locked = false,
      mode = "signin",
      switchable = false,
      hint = "Click the field to try it",
      frameless = false,
      toolbarButton = null,
      popupEl = null,
      popupFooter = () => "",
    } = {},
  ) {
    const id = `dm${++uid}`;
    root.classList.add("dm");
    root.classList.toggle("frameless", frameless);
    const CARD = `
            <form class="dm-form" novalidate>
              ${switchable ? `<div class="dm-switch" role="tablist" aria-label="Page"><button type="button" role="tab" data-m="signin">Sign in</button><button type="button" role="tab" data-m="signup">Create account</button></div>` : ""}
              <div class="dm-h"></div>
              <label class="dm-l" for="${id}-email">Email</label>
              <input class="dm-email" id="${id}-email" type="text" role="combobox" aria-expanded="false" aria-controls="${id}-menu" aria-autocomplete="list" placeholder="you@example.com" autocomplete="off" />
              <p class="dm-err" hidden>Enter your email.</p>
              <div class="dm-hint">${hint}</div>
              <label class="dm-l" for="${id}-pass">Password</label>
              <div class="dm-pass-wrap"><input class="dm-pass" id="${id}-pass" type="password" role="combobox" aria-expanded="false" aria-controls="${id}-menu" aria-autocomplete="list" autocomplete="off" /><button type="button" class="dm-eye" aria-label="Show password" aria-pressed="false">${EYE}</button></div>
              <p class="dm-err" hidden>Enter a password.</p>
              <button class="dm-submit" type="submit"><span class="dm-spin" aria-hidden="true"></span><span class="dm-submit-label"></span></button>
              <div class="dm-menu" id="${id}-menu" hidden></div>
            </form>
            <div class="dm-success" role="status" hidden></div>`;
    root.innerHTML =
      (frameless
        ? `<div class="dm-card"><div class="dm-site"><span aria-hidden="true"></span>example.com</div>${CARD}</div>`
        : `
      <div class="dm-win">
        <div class="dm-bar">
          <div class="dm-lights" aria-hidden="true"><i></i><i></i><i></i></div>
          <div class="dm-omni"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5H6V4.5a2 2 0 1 1 4 0Z"/></svg><span class="dm-url">example.com/login</span></div>
          <span class="dm-tb" aria-hidden="true">${PUZZLE}</span>
          <button class="dm-tb dm-ext" type="button" aria-expanded="false" aria-controls="${id}-pop" title="Apple Passwords Plus"><img src="${ICON}" alt="Apple Passwords Plus" /></button>
          <div class="dm-popup" id="${id}-pop" hidden></div>
        </div>
        <div class="dm-page">
          <div class="dm-site"><span aria-hidden="true"></span>example.com</div>
          <div class="dm-card">${CARD}
          </div>
        </div>
      </div>`) +
      `
      <div class="dm-mac dm-ask" hidden>
        <div class="dm-mac-head"><span class="dm-mac-icon">${KEY}</span><b>Passwords</b><small>now</small></div>
        <p>Enter this code in your browser</p>
        <div class="dm-mac-digits"></div>
      </div>
      <div class="dm-mac dm-save" role="dialog" aria-label="Save password" hidden>
        <div class="dm-mac-head"><span class="dm-mac-icon">${KEY}</span><b>Passwords</b><small>now</small></div>
        <p class="dm-save-q">Save this password for example.com?</p>
        <p class="dm-save-user"></p>
        <div class="dm-save-actions"><button type="button" data-save="no">Not Now</button><button type="button" data-save="yes" class="primary">Save Password</button></div>
      </div>`;

    const $ = (s) => root.querySelector(s);
    const email = $(".dm-email"),
      pass = $(".dm-pass"),
      menu = $(".dm-menu"),
      hintEl = $(".dm-hint");
    const form = $(".dm-form"),
      success = $(".dm-success"),
      submit = $(".dm-submit"),
      errs = [...root.querySelectorAll(".dm-err")];
    const ext = toolbarButton ?? $(".dm-ext"),
      popup = popupEl ?? $(".dm-popup"),
      ask = $(".dm-ask"),
      save = $(".dm-save");
    const digits = roller($(".dm-mac-digits"));
    const logins = [...LOGINS];
    const recent = []; // new passwords not yet confirmed as saved, listed in the popup like the real one
    let isLocked = locked,
      sel = 0,
      rows = [],
      field = email,
      busy = false,
      hme = hideMyEmail(),
      strong = strongPassword(),
      used = new Set();
    const emit = (name, detail) => root.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));

    const closeMenu = () => {
      menu.hidden = true;
      [email, pass].forEach((f) => {
        f.setAttribute("aria-expanded", "false");
        f.removeAttribute("aria-activedescendant");
      });
    };
    const select = (i) => {
      if (!rows.length) return;
      sel = (i + rows.length) % rows.length;
      rows.forEach((r, j) => {
        r.setAttribute("aria-selected", String(j === sel));
      });
      field.setAttribute("aria-activedescendant", rows[sel].id);
    };
    // Measured against the card (the menu's positioned container), since the field may sit in a wrapper.
    const place = () => {
      menu.style.top = `${field.getBoundingClientRect().bottom - $(".dm-card").getBoundingClientRect().top + 6}px`;
    };
    const showPanel = (el) => {
      el.hidden = false;
      requestAnimationFrame(() => el.classList.add("on"));
    };
    const hidePanel = (el) => {
      el.classList.remove("on");
      setTimeout(() => (el.hidden = true), 300);
    };

    // What the menu offers for the focused field, given the extension's settings.
    function items() {
      if (mode === "signin")
        return settings.inline
          ? [
              ...logins.map((u) => ({ kind: "login", icon: KEY, title: u, sub: "example.com", value: u })),
              { sep: true },
              { kind: "app", title: "Open Passwords App…" },
            ]
          : [];
      if (field === email) {
        const list = [];
        if (settings.hme) list.push({ kind: "hme", icon: MAIL, title: "Hide My Email", sub: hme, value: hme });
        if (settings.signup)
          list.push({
            kind: "me",
            icon: PERSON,
            title: "jane@example.com",
            sub: "From your contact card",
            value: "jane@example.com",
          });
        if (settings.hme) list.push({ sep: true }, { kind: "another", title: "Try Another Address" });
        return list;
      }
      return settings.signup
        ? [
            { kind: "strong", icon: KEY, title: "Use Strong Password", value: strong, masked: true },
            {
              kind: "strong",
              icon: KEY,
              title: "No Special Characters",
              value: strong.replaceAll("-", ""),
              masked: true,
            },
          ]
        : [];
    }

    function renderRows() {
      menu.setAttribute("role", "listbox");
      const list = items();
      menu.innerHTML = list
        .map((it, i) =>
          it.sep
            ? "<hr />"
            : `<div class="dm-row${it.icon ? "" : " plain"}" role="option" id="${id}-o${i}" data-i="${i}">${it.icon ?? ""}<div><b>${it.title}</b>${it.masked ? `<small class="dm-pw" data-full="${it.value}">${maskPw(it.value)}</small>` : it.sub ? `<small>${it.sub}</small>` : ""}</div>${it.masked ? `<span class="dm-peek" aria-hidden="true">${EYE}</span>` : ""}</div>`,
        )
        .join("");
      // Hovering a suggestion's eye shows the whole password, like the real menu.
      menu.querySelectorAll(".dm-peek").forEach((eye) => {
        const pw = eye.parentElement.querySelector(".dm-pw");
        eye.addEventListener("mouseenter", () => (pw.textContent = pw.dataset.full));
        eye.addEventListener("mouseleave", () => (pw.textContent = maskPw(pw.dataset.full)));
      });
      rows = [...menu.querySelectorAll(".dm-row")];
      rows.forEach((r, i) => {
        const it = list[Number(r.dataset.i)];
        r.addEventListener("mouseenter", () => select(i));
        r.addEventListener("mousedown", (e) => {
          e.preventDefault();
          choose(it);
        });
      });
      select(0);
    }

    function renderUnlock() {
      menu.removeAttribute("role");
      rows = [];
      menu.innerHTML = `
        <div class="dm-unlock">
          <b>Unlock Apple Passwords Plus</b>
          <p>Type the six digits your Mac is showing. Once, until you quit.</p>
          <input class="dm-code" inputmode="numeric" maxlength="6" autocomplete="off" aria-label="Six digits from your Mac" placeholder="······" />
          <div class="dm-unlock-foot">
            <button type="button" class="dm-touch"><svg class="fp"></svg><span>Hold for Touch ID</span></button>
            <button type="button" class="dm-auto">Type it for me</button>
          </div>
        </div>`;
      const code = menu.querySelector(".dm-code");
      code.addEventListener("input", () => {
        code.value = code.value.replace(/\D/g, "").slice(0, 6);
        if (code.value.length < 6) return;
        if (code.value === digits.code) unlock();
        else {
          code.classList.remove("shake");
          void code.offsetWidth;
          code.classList.add("shake");
          code.value = "";
        }
      });
      code.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          closeMenu();
          field.focus();
        }
      });
      menu.querySelector(".dm-auto").addEventListener("click", async () => {
        for (const ch of digits.code) {
          code.value += ch;
          await wait(90);
        }
        unlock();
      });
      const btn = menu.querySelector(".dm-touch");
      hold(btn, print(btn.querySelector("svg")), unlock, { duration: 800 });
      setTimeout(() => code.focus(), 60);
    }

    function openMenu(f) {
      if (f.value || busy) return;
      const same = field === f && !menu.hidden;
      field = f;
      // Nothing to offer here (a setting is off): no menu, like the real extension.
      if (!items().length) return closeMenu();
      hintEl.hidden = true;
      place();
      if (isLocked) {
        if (!same || !menu.querySelector(".dm-unlock")) {
          renderUnlock();
          digits.set();
          showPanel(ask);
          emit("demo:ask");
        }
      } else if (!same || !rows.length) renderRows();
      menu.hidden = false;
      f.setAttribute("aria-expanded", "true");
    }

    function unlock() {
      if (!isLocked) return;
      isLocked = false;
      hidePanel(ask);
      renderRows();
      menu.hidden = false;
      field.focus();
      emit("demo:unlock");
    }

    function lock() {
      isLocked = true;
      closeMenu();
      emit("demo:lock");
    }

    function choose(it) {
      if (it.kind === "another") {
        hme = hideMyEmail();
        renderRows();
        return;
      }
      if (it.kind === "app") {
        closeMenu();
        return;
      }
      fill(it.kind, it.value);
    }

    function fill(kind, value) {
      closeMenu();
      setPopup(false);
      if (kind === "login") {
        email.value = value;
        pass.value = "correct-horse-battery";
      } else if (kind === "strong") {
        pass.value = value;
        recent.unshift({ user: email.value || "example.com", pw: value });
      } else email.value = value;
      used.add(kind);
      clearErrors();
      emit("demo:fill", { kind });
      if (mode === "signup" && kind !== "strong" && !pass.value && document.activeElement === email)
        setTimeout(() => pass.focus(), 350);
    }

    const clearErrors = () =>
      errs.forEach((e, i) => {
        if ([email, pass][i].value) {
          e.hidden = true;
          [email, pass][i].classList.remove("invalid");
        }
      });

    // The site's own submit: check the fields, a moment of "Signing in…", then the signed-in page.
    async function send(e) {
      e?.preventDefault();
      if (busy) return;
      const missing = [email, pass].filter((f) => !f.value.trim());
      [email, pass].forEach((f, i) => {
        const bad = missing.includes(f);
        errs[i].hidden = !bad;
        f.classList.toggle("invalid", bad);
      });
      if (missing.length) return;
      busy = true;
      closeMenu();
      submit.classList.add("busy");
      $(".dm-submit-label").textContent = mode === "signin" ? "Signing in…" : "Creating account…";
      await wait(900);
      let saved = false;
      if (mode === "signup") saved = await askToSave();
      submit.classList.remove("busy");
      busy = false;
      showSignedIn(saved);
      emit("demo:submit", { mode });
    }

    // Apple's helper asks macOS to save a new password once the page moves on with it.
    function askToSave() {
      $(".dm-save-user").textContent = email.value;
      showPanel(save);
      return new Promise((resolve) => {
        save.querySelectorAll("[data-save]").forEach((b) => {
          b.onclick = () => {
            const yes = b.dataset.save === "yes";
            if (yes) {
              if (!logins.includes(email.value)) logins.push(email.value);
              const i = recent.findIndex((r) => r.user === email.value);
              if (i >= 0) recent.splice(i, 1);
            }
            hidePanel(save);
            resolve(yes);
          };
        });
      });
    }

    function showSignedIn(saved) {
      const who = email.value;
      const notes =
        mode === "signin"
          ? ""
          : (used.has("hme")
              ? `<p class="dm-note">That's a Hide My Email address. Mail to it reaches your inbox, and the site never sees your real one.</p>`
              : "") +
            (saved ? `<p class="dm-note">Your password is saved in Apple Passwords, on all your devices.</p>` : "");
      success.innerHTML = `
        <span class="dm-avatar" aria-hidden="true">${who[0]?.toUpperCase() ?? "?"}</span>
        <b>${mode === "signin" ? "Welcome back" : "Account created"}</b>
        <p>Signed in as ${who}</p>${notes}
        <button type="button" class="dm-link">Sign out</button>`;
      success.querySelector(".dm-link").addEventListener("click", () => setMode("signin"));
      form.hidden = true;
      success.hidden = false;
    }

    function reset() {
      email.value = "";
      pass.value = "";
      used = new Set();
      errs.forEach((e) => {
        e.hidden = true;
      });
      [email, pass].forEach((f) => {
        f.classList.remove("invalid");
      });
      hme = hideMyEmail();
      strong = strongPassword();
    }

    const eye = $(".dm-eye");
    const showPass = (on) => {
      pass.type = on ? "text" : "password";
      eye.innerHTML = on ? EYE_OFF : EYE;
      eye.setAttribute("aria-pressed", String(on));
      eye.setAttribute("aria-label", on ? "Hide password" : "Show password");
    };
    eye.addEventListener("click", () => showPass(pass.type === "password"));
    function setMode(m) {
      mode = m;
      reset();
      showPass(false);
      eye.hidden = m !== "signup";
      closeMenu();
      form.hidden = false;
      success.hidden = true;
      $(".dm-h").textContent = m === "signin" ? "Sign in" : "Create your account";
      $(".dm-submit-label").textContent = m === "signin" ? "Sign in" : "Create account";
      const url = $(".dm-url");
      if (url) url.textContent = m === "signin" ? "example.com/login" : "example.com/signup";
      root.querySelectorAll(".dm-switch button").forEach((b) => {
        b.setAttribute("aria-selected", String(b.dataset.m === m));
      });
      emit("demo:mode", { mode: m });
    }

    // Mirrors the real popup: the site's logins, recent passwords, Open Passwords App, then settings.
    function renderPopup() {
      popup.innerHTML = isLocked
        ? `<div class="dm-pop-h">Apple Passwords Plus</div><p class="dm-pop-p">Locked. Click a field on the page to unlock it.</p>`
        : `<div class="dm-pop-h">example.com</div>
           <ul class="dm-pop-logins">${logins.map((u) => `<li><button type="button" class="dm-pop-row" data-user="${u}" title="Fill ${u}"><i>${u[0].toUpperCase()}</i>${u}</button></li>`).join("")}</ul>
           ${recent.length ? `<div class="dm-pop-sec"><h5>Recent passwords</h5><ul class="dm-pop-logins">${recent.map((r, i) => `<li class="dm-pop-recent"><span>${r.user}</span><button type="button" data-copy="${i}">Copy</button></li>`).join("")}</ul><p class="dm-pop-hint">New passwords from this session, in case one wasn't saved.</p></div>` : ""}
           <button type="button" class="dm-pop-link">Open Passwords App</button>
           ${settingsHTML()}`;
      popup.insertAdjacentHTML("beforeend", popupFooter());
      bindSettings(popup);
      popup.querySelectorAll(".dm-pop-row").forEach((b) => {
        b.addEventListener("click", () => {
          if (!form.hidden) {
            email.value = "";
            pass.value = "";
            fill("login", b.dataset.user);
          }
        });
      });
      popup.querySelectorAll("[data-copy]").forEach((b) => {
        b.addEventListener("click", () => {
          b.textContent = "Copied";
        });
      });
      popup.querySelector(".dm-pop-lock")?.addEventListener("click", () => {
        setPopup(false);
        lock();
      });
    }
    const setPopup = (open) => {
      popup.hidden = !open;
      ext.setAttribute("aria-expanded", String(open));
      if (open) renderPopup();
    };

    for (const f of [email, pass]) {
      f.addEventListener("focus", () => openMenu(f));
      f.addEventListener("click", () => openMenu(f));
      f.addEventListener("input", () => {
        closeMenu();
        clearErrors();
      });
      f.addEventListener("keydown", (e) => {
        if (menu.hidden) {
          if (e.key === "ArrowDown") {
            openMenu(f);
            e.preventDefault();
          }
          return;
        }
        if (e.key === "Escape") return closeMenu();
        if (!rows.length) return;
        if (e.key === "ArrowDown") {
          select(sel + 1);
          e.preventDefault();
        } else if (e.key === "ArrowUp") {
          select(sel - 1);
          e.preventDefault();
        } else if (e.key === "Enter") {
          rows[sel].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          e.preventDefault();
        }
      });
    }
    form.addEventListener("submit", send);
    root.querySelectorAll(".dm-switch button").forEach((b) => {
      b.addEventListener("click", () => setMode(b.dataset.m));
    });
    ext.addEventListener("click", (e) => {
      e.stopPropagation();
      setPopup(popup.hidden);
    });
    document.addEventListener("pointerdown", (e) => {
      if (!popup.contains(e.target) && !ext.contains(e.target)) setPopup(false);
      if (!menu.contains(e.target) && e.target !== email && e.target !== pass) closeMenu();
    });
    // A setting changed (here or in another popup): the next menu reflects it.
    document.addEventListener("kit:settings", closeMenu);

    setMode(mode);
    hintEl.style.top = `${email.offsetTop}px`;
    // For scripted tours: open a field's menu, pick a row, find things to point at.
    const pickRow = (i) => rows[i]?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    const target = (what) =>
      ({
        email,
        pass,
        signup: $('.dm-switch [data-m="signup"]'),
        signin: $('.dm-switch [data-m="signin"]'),
        submit,
        row0: rows[0],
      })[what];
    root.demo = {
      lock,
      unlock,
      reset,
      setMode,
      open: (w) => openMenu(w === "pass" ? pass : email),
      pick: pickRow,
      target,
      close: closeMenu,
      get mode() {
        return mode;
      },
      get locked() {
        return isLocked;
      },
    };
    return root.demo;
  }

  // Mark the navigation tab for the section currently on screen.
  function nav() {
    const onScroll = (fn) => {
      addEventListener("scroll", fn, { passive: true });
      fn();
    };
    const watchSections = (links, mark) => {
      const map = new Map();
      links.forEach((a) => {
        const id = a.getAttribute("href").slice(1);
        const el = id && document.getElementById(id);
        if (el) map.set(el, a);
      });
      if (!map.size || !("IntersectionObserver" in window)) return;
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) if (e.isIntersecting) mark(map.get(e.target));
        },
        { rootMargin: "-45% 0px -50% 0px" },
      );
      map.forEach((_, el) => {
        io.observe(el);
      });
      onScroll(() => {
        if (scrollY < innerHeight * 0.4) mark(null);
      });
    };

    const toolbar = document.querySelector(".nav-chrome");
    if (toolbar) {
      const tabs = [...toolbar.querySelectorAll(".tab")];
      const mark = (a) =>
        tabs.forEach((t) => {
          t.classList.toggle("on", t === (a ?? tabs[0]));
        });
      mark(null);
      watchSections(tabs.slice(1), mark);
    }
  }
  nav();

  return {
    reduce,
    reveal,
    roller,
    randomCode,
    spaced,
    print,
    hold,
    demo,
    hideMyEmail,
    strongPassword,
    settings,
    setSetting,
    settingsHTML,
    bindSettings,
  };
})();
