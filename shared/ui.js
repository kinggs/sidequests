// shared/ui.js — the five things every sidequest's UI does, so no app writes them again.
//
//   import { ui } from "../shared/ui.js";
//   ui.tap(btn, fn)                     a tap off pointerup; a scroll never fires it
//   ui.hold(btn, fn)                    600ms hold-to-confirm with the rising fill (.hold)
//   ui.toast("Saved")                   a short message at the bottom
//   ui.sheet({ title, text, items })    a bottom sheet of actions; resolves with the item's value
//   ui.menu(rowButton, items)           the ⋯ on a card row: same sheet, wired to the row
//   ui.account(hostEl, user)            the avatar in the header; tapping it opens sign-out
//
// Destructive actions are never a plain tap: { label, value, hold: true } puts the item behind a
// hold inside the sheet. There are no "Sure?" buttons and no confirm() dialogs anywhere.

const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const buzz = p => { if (navigator.vibrate) navigator.vibrate(p); };

function tap(node, fn){
  if (!node) return;
  let down = false, sx = 0, sy = 0;
  node.addEventListener("pointerdown", e => { down = true; sx = e.clientX; sy = e.clientY; });
  node.addEventListener("pointercancel", () => { down = false; });
  node.addEventListener("pointerup", e => {
    if (!down) return;
    down = false;
    if (Math.abs(e.clientX - sx) > 14 || Math.abs(e.clientY - sy) > 14) return;
    e.preventDefault();
    fn(e);
  });
  // A click with no pointer behind it (detail 0) is Enter or Space on a focused button.
  node.addEventListener("click", e => { e.preventDefault(); if (e.detail === 0) fn(e); });
}

const HOLD_MS = 600;
function hold(node, fn){
  if (!node) return;
  node.classList.add("hold");
  let timer = null, sx = 0, sy = 0;
  const stop = () => { clearTimeout(timer); timer = null; node.classList.remove("holding"); };
  node.addEventListener("pointerdown", e => {
    sx = e.clientX; sy = e.clientY; stop();
    node.classList.add("holding");
    timer = setTimeout(() => { stop(); buzz(16); fn(); }, calm() ? 150 : HOLD_MS);
  });
  node.addEventListener("pointermove", e => { if (timer && (Math.abs(e.clientX - sx) > 40 || Math.abs(e.clientY - sy) > 40)) stop(); });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) node.addEventListener(ev, stop);
  node.addEventListener("click", e => e.preventDefault());
  node.addEventListener("contextmenu", e => e.preventDefault());
  node.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); fn(); } });
}

function toast(msg){
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// items: [{ label, value, hold?, warn?, primary? }]. Resolves the chosen value, or null.
// Escape cancels, and focus goes back to whatever opened the sheet.
function sheet({ title = "", text = "", items = [] } = {}){
  return new Promise(resolve => {
    const opener = document.activeElement;
    const scrim = document.createElement("div");
    scrim.className = "scrim";
    const box = document.createElement("div");
    box.className = "sheet"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    if (title){ const h = document.createElement("h2"); h.textContent = title; box.appendChild(h); }
    if (text){ const p = document.createElement("p"); p.textContent = text; box.appendChild(p); }
    const onKey = e => { if (e.key === "Escape"){ e.preventDefault(); close(null); } };
    const close = v => {
      document.removeEventListener("keydown", onKey);
      scrim.remove();
      if (opener && opener.isConnected && opener.focus) opener.focus({ preventScroll: true });
      resolve(v);
    };
    for (const it of items){
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = it.hold ? `Hold to ${it.label.toLowerCase()}` : it.label;
      if (it.primary) b.className = "primary";
      if (it.warn || it.hold) b.classList.add("warnbtn");
      if (it.hold) hold(b, () => close(it.value)); else tap(b, () => close(it.value));
      box.appendChild(b);
    }
    const c = document.createElement("button");
    c.type = "button"; c.className = "cancel"; c.textContent = "Cancel";
    tap(c, () => close(null));
    box.appendChild(c);
    scrim.appendChild(box);
    scrim.addEventListener("pointerup", e => { if (e.target === scrim) close(null); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(scrim);
    box.tabIndex = -1;
    box.focus({ preventScroll: true });
  });
}

// The ⋯ on a row. Give it the row's title so the sheet says what it's about.
function menu(btn, { title, text, items }){
  tap(btn, async () => {
    const v = await sheet({ title, text, items });
    const it = items.find(i => i.value === v);
    if (it && it.run) it.run();
  });
}

// Mount the account button into the header. `user` is cloud's user (or null). Tapping the
// avatar opens a sheet with the name, sign out, and whatever else the app passes in `extra`.
function account(host, user, { onSignIn, onSignOut, extra = [] } = {}){
  if (!host) return;
  host.innerHTML = "";
  const b = document.createElement("button");
  b.type = "button"; b.className = "me";
  if (user){
    b.setAttribute("aria-label", "Account");
    if (user.photoURL){ const img = document.createElement("img"); img.src = user.photoURL; img.alt = ""; b.appendChild(img); }
    else b.textContent = (user.displayName || "?").trim()[0].toUpperCase();
    tap(b, async () => {
      const v = await sheet({ title: user.displayName || "Account", text: user.email || "", items: [
        ...extra, { label: "Sign out", value: "out" }
      ] });
      const it = extra.find(i => i.value === v);
      if (it && it.run) it.run(); else if (v === "out" && onSignOut) onSignOut();
    });
  } else {
    b.className = "quiet me-in";
    b.textContent = "Sign in";
    tap(b, () => onSignIn && onSignIn());
  }
  host.appendChild(b);
}

export const ui = { tap, hold, toast, sheet, menu, account, buzz };
