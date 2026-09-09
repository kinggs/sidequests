// shared/phone.js — the parts of being an app on a phone that every sidequest wants:
// installing properly, going fullscreen, and keeping the screen awake.
//
//   import { phone } from "../shared/phone.js";
//   phone.mountInstall(document.getElementById("installHere"));  // hides itself once installed
//   phone.fullscreen();            // on the tap that opens a focused screen
//   phone.keepAwake(true);         // hold the screen on; false to let it sleep
//
// Why this exists: Chrome only builds a real installed app (a WebAPK, no URL bar) when the
// manifest offers PNG icons. With an SVG-only manifest it quietly makes a plain shortcut
// that opens in a browser tab instead — and once that shortcut is on the home screen it
// never offers the proper install again. So every app here ships icon-192.png,
// icon-512.png and icon-maskable-512.png, asks for fullscreen, and carries an Install
// button of its own so the offer is always one tap away.

const mq = q => !!(window.matchMedia && window.matchMedia(q).matches);

// True when we're running as an installed app rather than in a browser tab.
export const installed = () =>
  mq("(display-mode: fullscreen)") || mq("(display-mode: standalone)") ||
  mq("(display-mode: minimal-ui)") || navigator.standalone === true;

const isIOS = () =>
  /iP(hone|od|ad)/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const steps = () => isIOS()
  ? "Tap Share at the bottom of the browser, then “Add to Home Screen”."
  : "Tap ⋮ in the browser's top corner, then “Install app” (or “Add to Home screen”).";

// Chrome fires this instead of showing its own banner. Hold on to it until the owner taps.
let offer = null;
const refreshers = [];
const refresh = () => refreshers.forEach(fn => { try { fn(); } catch {} });

window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); offer = e; refresh(); });
window.addEventListener("appinstalled", () => { offer = null; refresh(); });

// Taps come off pointerup here too, so a scroll never fires one.
function tap(node, fn){
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
  node.addEventListener("click", e => e.preventDefault());
}

// ---- fullscreen ----
// The manifest is what matters for an installed app. This is the fallback for a browser
// tab or an old home-screen shortcut, and it has to be called from a tap.
function fullscreen(){
  if (mq("(display-mode: fullscreen)") || document.fullscreenElement) return;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  try { const r = req.call(el, { navigationUI: "hide" }); if (r && r.catch) r.catch(() => {}); } catch {}
}

// ---- wake lock ----
// Hold exactly one lock. Android drops it when the app goes to the background or the
// screen turns off, so re-take it when the app comes back.
let lock = null, wanted = false;

async function take(){
  if (!("wakeLock" in navigator) || !wanted || lock) return;
  if (document.visibilityState !== "visible") return;   // a request while hidden always rejects
  try {
    lock = await navigator.wakeLock.request("screen");
    lock.addEventListener("release", () => { lock = null; });
  } catch { lock = null; }   // unsupported, low battery, or refused — the app still works
}

async function drop(){
  const l = lock;
  lock = null;
  if (l) { try { await l.release(); } catch {} }
}

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") take(); });

function keepAwake(on){
  wanted = !!on;
  if (wanted) take(); else drop();
}

// ---- the install button ----
// Shown whenever we're not already an installed app, so there's always something to tap.
// Chrome's saved offer installs in one go; anywhere else it spells out the manual steps.
function mountInstall(host, { label = "Install on this phone", className = "quiet" } = {}){
  if (!host) return null;

  const wrap = document.createElement("div");
  wrap.className = "installkit";
  wrap.style.cssText = "margin-top:12px";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.style.cssText = "width:100%";
  btn.textContent = label;

  const note = document.createElement("p");
  note.style.cssText = "font-size:15px;line-height:1.35;opacity:.75;margin-top:8px";
  note.hidden = true;

  wrap.append(btn, note);
  host.appendChild(wrap);

  const update = () => { wrap.hidden = installed(); };
  refreshers.push(update);
  update();

  tap(btn, async () => {
    if (!offer){ note.hidden = false; note.textContent = steps(); return; }
    note.hidden = true;
    btn.disabled = true;
    try {
      offer.prompt();
      const res = await offer.userChoice;
      offer = null;                       // a saved offer is single-use either way
      if (!res || res.outcome !== "accepted"){ note.hidden = false; note.textContent = steps(); }
    } catch {
      note.hidden = false; note.textContent = steps();
    }
    btn.disabled = false;
    refresh();
  });

  return wrap;
}

export const phone = { installed, fullscreen, keepAwake, mountInstall };
