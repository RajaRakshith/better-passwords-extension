(() => {
  Kit.reveal();
  // The demo lives in the hero; the button in the page's corner is its extension button.
  const demoEl = document.getElementById("demo");
  const extBtn = document.getElementById("ext-btn");
  const extPop = document.getElementById("ext-pop");
  const browserName = document.querySelector("[data-browser]")?.textContent ?? "Chrome";
  const storeHref = () => document.querySelector("[data-add]").href;
  const demo = Kit.demo(demoEl, {
    switchable: true,
    frameless: true,
    intro: true,
    toolbarButton: extBtn,
    popupEl: extPop,
    popupFooter: () =>
      `<div class="preview"><p>This is a preview. Set up the extension in ${browserName} to use it for real.</p><a class="preview-add" href="${storeHref()}">Get the extension</a></div>`,
  });
  const orb = document.createElement("button");
  orb.type = "button";
  orb.className = "orb";
  orb.setAttribute("aria-label", "Try it: open the email field's suggestions");
  demoEl.append(orb);

  const place = () => {
    const el = demo.target("email");
    if (!el || orb.hidden) return;
    orb.style.left = `${el.offsetLeft + Math.min(190, el.offsetWidth * 0.55)}px`;
    orb.style.top = `${el.offsetTop + el.offsetHeight / 2}px`;
  };
  // Once the demo has been used, the dot steps aside. The "try it" note stays.
  const done = () => {
    orb.hidden = true;
  };
  orb.addEventListener("click", () => {
    done();
    demo.target("email").focus();
  });
  demoEl.addEventListener(
    "pointerdown",
    (e) => {
      if (e.target !== orb) done();
    },
    true,
  );
  demoEl.addEventListener("focusin", (e) => {
    if (e.target !== orb) done();
  });
  // Anything that uses the demo, including the extension popup outside the card, retires the dot.
  ["demo:fill", "demo:mode", "demo:ask"].forEach((ev) => {
    demoEl.addEventListener(ev, done);
  });
  place();
  addEventListener("resize", place);

  // Opening the extension ends its first-visit pulse.
  extBtn.addEventListener("click", () => {
    extBtn.classList.remove("hint");
  });

  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !extPop.hidden) {
      extPop.hidden = true;
      extBtn.setAttribute("aria-expanded", "false");
      extBtn.focus();
    }
  });
})();
