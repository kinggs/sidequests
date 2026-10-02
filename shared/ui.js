// shared/ui.js — the things every sidequest's UI does, so no app writes them again.
//
//   import { ui } from "../shared/ui.js";
//   ui.tap(btn, fn)                     a tap off pointerup; a scroll never fires it
//   ui.tap(btn, fn, { slop: 40 })       …forgiving more movement (a score button mid-game)
//   ui.hold(btn, fn)                    600ms hold-to-confirm with the rising fill (.hold)
//   ui.hold(btn, fn, { tap, holding })  …a plain tap runs tap.run() while tap.when() is true;
//                                       holding(true/false) hears the press start and stop
//   ui.toast("Saved")                   a short message at the bottom
//   ui.sheet({ title, text, items })    a bottom sheet of actions; resolves with the item's value
//   ui.sheet({ title, body })           …or of anything: body(close) returns the node to show,
//                                       and calls close(value) when it's done
//   ui.menu(rowButton, items)           the ⋯ on a card row: same sheet, wired to the row
//   ui.account(hostEl, user, opts)      your avatar in the header; tapping it opens your sheet
//
// Destructive actions are never a plain tap: { label, value, hold: true } puts the item behind a
// hold inside the sheet. There are no "Sure?" buttons and no confirm() dialogs anywhere.

const buzz = p => { if (navigator.vibrate) navigator.vibrate(p); };

function tap(node, fn, { slop = 14 } = {}){
  if (!node) return;
  let down = false, sx = 0, sy = 0;
  node.addEventListener("pointerdown", e => { down = true; sx = e.clientX; sy = e.clientY; });
  node.addEventListener("pointercancel", () => { down = false; });
  node.addEventListener("pointerup", e => {
    if (!down) return;
    down = false;
    if (Math.abs(e.clientX - sx) > slop || Math.abs(e.clientY - sy) > slop) return;
    e.preventDefault();
    fn(e);
  });
  // A click with no pointer behind it (detail 0) is Enter or Space on a focused button.
  node.addEventListener("click", e => { e.preventDefault(); if (e.detail === 0) fn(e); });
}

// 600ms always: under reduced motion the fill appears at once (theme.css), but the wait stays,
// so a careful action is never one brush of a finger.
const HOLD_MS = 600;
function hold(node, fn, { tap = null, holding = null } = {}){
  if (!node) return;
  node.classList.add("hold");
  let timer = null, down = false, sx = 0, sy = 0;
  const stop = () => {
    const was = !!timer || node.classList.contains("holding");
    clearTimeout(timer); timer = null; node.classList.remove("holding");
    if (was && holding) holding(false);
  };
  node.addEventListener("pointerdown", e => {
    down = true; sx = e.clientX; sy = e.clientY;
    if (tap && tap.when()) return;
    stop();
    node.classList.add("holding");
    if (holding) holding(true);
    timer = setTimeout(() => { stop(); buzz(16); fn(); }, HOLD_MS);
  });
  node.addEventListener("pointermove", e => { if (timer && (Math.abs(e.clientX - sx) > 40 || Math.abs(e.clientY - sy) > 40)) stop(); });
  node.addEventListener("pointerup", e => {
    const was = down; down = false;
    if (timer){ stop(); return; }
    if (was && tap && tap.when() && Math.abs(e.clientX - sx) <= 40 && Math.abs(e.clientY - sy) <= 40) tap.run();
  });
  node.addEventListener("pointercancel", () => { down = false; stop(); });
  node.addEventListener("pointerleave", () => { if (timer) stop(); });
  node.addEventListener("click", e => e.preventDefault());
  node.addEventListener("contextmenu", e => e.preventDefault());
  node.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    tap && tap.when() ? tap.run() : fn();
  });
}

function toast(msg){
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  t.setAttribute("role", "status");
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// items: [{ label, value, hold?, warn?, primary? }]. Resolves the chosen value, or null.
// body: (close) => Node, shown under the text, for a form or a list; it calls close(value).
// cancel: false leaves out the Cancel button (the body has its own way out); dismiss: false
// also ignores Escape and a tap outside, for a question that must be answered.
// Escape cancels, and focus goes back to whatever opened the sheet.
function sheet({ title = "", text = "", items = [], body = null, cancel = true, dismiss = true, className = "" } = {}){
  return new Promise(resolve => {
    const opener = document.activeElement;
    const scrim = document.createElement("div");
    scrim.className = "scrim";
    const box = document.createElement("div");
    box.className = "sheet" + (className ? " " + className : "");
    box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    if (title){ const h = document.createElement("h2"); h.textContent = title; box.appendChild(h); }
    if (text){ const p = document.createElement("p"); p.textContent = text; box.appendChild(p); }
    let closed = false;
    const onKey = e => { if (dismiss && e.key === "Escape"){ e.preventDefault(); close(null); } };
    const close = v => {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey);
      scrim.remove();
      if (opener && opener.isConnected && opener.focus) opener.focus({ preventScroll: true });
      resolve(v === undefined ? null : v);
    };
    if (body){ const node = body(close); if (node) box.appendChild(node); }
    for (const it of items){
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = it.hold ? `Hold to ${it.label[0].toLowerCase()}${it.label.slice(1)}` : it.label;
      if (it.primary) b.className = "primary";
      if (it.warn || it.hold) b.classList.add("warnbtn");
      if (it.hold) hold(b, () => close(it.value)); else tap(b, () => close(it.value));
      box.appendChild(b);
    }
    if (cancel){
      const c = document.createElement("button");
      c.type = "button"; c.className = "cancel"; c.textContent = "Cancel";
      tap(c, () => close(null));
      box.appendChild(c);
    }
    scrim.appendChild(box);
    scrim.addEventListener("pointerup", e => { if (dismiss && e.target === scrim) close(null); });
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
// avatar opens a sheet with your name, whatever the app passes in `extra` ({ label, value, run }),
// and Sign out. `name` and `avatar` (a node, e.g. people.avatar(me, 48)) show your profile
// rather than Google's; `text` is the line under the name (default: the email).
function account(host, user, { onSignIn, onSignOut, extra = [], name = "", text = null, avatar = null } = {}){
  if (!host) return;
  host.innerHTML = "";
  const b = document.createElement("button");
  b.type = "button"; b.className = "me";
  if (user){
    b.setAttribute("aria-label", "Account");
    if (avatar) b.appendChild(avatar);
    else if (user.photoURL){ const img = document.createElement("img"); img.src = user.photoURL; img.alt = ""; img.referrerPolicy = "no-referrer"; b.appendChild(img); }
    else b.textContent = (name || user.displayName || "?").trim()[0].toUpperCase();
    tap(b, async () => {
      const v = await sheet({ title: name || user.displayName || "Account", text: text ?? (user.email || ""), items: [
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
