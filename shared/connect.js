// shared/connect.js — the Connect part: My QR, scan to connect, Friends (KIT.md).
//
//   import { connect } from "../shared/connect.js";   // reads ?i=<code> the moment it loads
//   await cloud.init("rack-it");
//   connect.handleInvite({ app: "rack-it", onDone }); // first, before the app's own start
//   connect.showQR({ app: "rack-it" });               // My QR
//   connect.showFriends();                            // the Friends list, with Remove
//   connect.avatar(uid, 36)                           // <span>: their photo in a neutral ring, or their initial
//
// Meeting someone: you open My QR, they point their camera at it, and the link opens this
// app at ?i=<code>. Signed in, they're connected at once; signed out, a card says who it's
// from and offers Sign in with Google, and they're connected when they come back. The QR is
// the consent, so nobody accepts anything. A friendship belongs to the account, so it shows
// in every app with Connect. Built on cloud.account; the rules are in firestore.rules.

import { cloud } from "./cloud.js";
import { phone } from "./phone.js";
import qrcode from "./vendor/qrcode.js";

const KEY = "connect.invite";   // the scanned code, kept through the Google sign-in redirect

// Before anything else: save the code and take it out of the address bar, so a reload or a
// shared screenshot doesn't carry it, and the sign-in redirect can't lose it.
(function keepCode(){
  try {
    const url = new URL(location.href);
    const code = url.searchParams.get("i");
    if (code === null) return;
    if (code) localStorage.setItem(KEY, code);
    url.searchParams.delete("i");
    history.replaceState(history.state, "", url.toString().replace("mock=&", "mock&").replace(/mock=$/, "mock"));
  } catch {}
})();
const savedCode = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
const forget = () => { try { localStorage.removeItem(KEY); } catch {} };

// ---- taps: pointerup, not click (same as the apps) ----
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
// First tap arms it for five seconds, second tap does it.
function armed(btn, label, sure, fn){
  let timer = null;
  tap(btn, () => {
    if (!timer){
      timer = setTimeout(() => { timer = null; btn.classList.remove("arm"); btn.textContent = label; }, 5000);
      btn.classList.add("arm");
      btn.textContent = sure;
      if (navigator.vibrate) navigator.vibrate(12);
      return;
    }
    clearTimeout(timer); timer = null;
    fn();
  });
}

// ---- looks: shared/theme.css's parts, plus these ----
const CSS = `
.cn-ov{position:fixed;inset:0;z-index:40;background:var(--ink-0,#0a0d11);color:var(--text,#e8edf3);display:flex;flex-direction:column;
  padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));overflow-y:auto;overscroll-behavior:contain}
.cn-ov *{box-sizing:border-box;touch-action:manipulation}
.cn-ov [hidden]{display:none !important}
.cn-mid{flex:1;width:100%;max-width:26rem;margin:0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center}
.cn-top{width:100%;max-width:26rem;margin:0 auto;display:flex;flex-direction:column;gap:12px}
.cn-ov h2{font-family:var(--grot,inherit);font-size:1.4444rem;font-weight:600;letter-spacing:-.02em;line-height:1.25;margin:0}
.cn-ov p{margin:0;line-height:1.45}
.cn-ov .cn-dim{color:var(--dim,#a8b6c4);font-size:.9444rem}
.cn-ov button{width:100%;min-height:var(--tap,60px);font-size:1rem}
.cn-ov .cn-big{min-height:var(--tap-lg,76px);font-size:1.1111rem}
.cn-qr{background:#fff;border-radius:var(--r-card,18px);padding:0;width:min(82vw,46dvh,360px);aspect-ratio:1}
.cn-qr svg{display:block;width:100%;height:100%}
.cn-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:60px}
.cn-head button{width:auto;padding:0 18px}
.cn-ov input{width:100%}
.cn-ov .rows>li{cursor:default}
.cn-ov .rows .cn-row{flex-wrap:wrap}
.cn-ov .rows .cn-rm{flex:1 0 100%;margin:4px 6px 6px 0}
.cn-av{display:inline-flex;align-items:center;justify-content:center;flex:none;box-sizing:border-box;width:var(--s);height:var(--s);
  border-radius:50%;padding:3px;background:var(--text-2,#c3ceda);overflow:hidden;font-family:var(--grot,inherit);font-weight:700;
  line-height:1;font-size:calc(var(--s) * .42);color:var(--ink-0,#0a0d11)}
.cn-av img{display:block;width:100%;height:100%;border-radius:50%;object-fit:cover;border:2px solid var(--ink-0,#0a0d11);background:var(--ink-0,#0a0d11)}
`;
function injectCss(){
  if (document.getElementById("cn-css")) return;
  const s = document.createElement("style");
  s.id = "cn-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}
function overlay(html){
  injectCss();
  const ov = document.createElement("div");
  ov.className = "cn-ov";
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  ov.innerHTML = html;
  document.body.appendChild(ov);
  return ov;
}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// How an account looks: their photo in a neutral ring (the only colour on a person is their
// own, and an account has none yet), or their initial. Same shape as people.avatar.
function avatar(uid, size = 36, known = null){
  injectCss();
  const node = document.createElement("span");
  node.className = "cn-av";
  node.setAttribute("aria-hidden", "true");
  node.style.setProperty("--s", size + "px");
  const paint = p => {
    node.textContent = "";
    const initial = () => { node.textContent = ([...String((p && p.name) || "?").trim()][0] || "?").toUpperCase(); };
    if (p && p.photo){
      const img = document.createElement("img");
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.decoding = "async";
      img.addEventListener("error", () => { img.remove(); initial(); });
      img.src = p.photo;
      node.append(img);
    } else initial();
  };
  paint(known);
  if (uid && !(known && known.photo)) cloud.account.profile(uid).then(p => p && paint(p));
  return node;
}

// ---- arriving through a QR ----
let inviteDone = false;
function handleInvite({ app = "", onDone } = {}){
  const code = savedCode();
  if (!code || inviteDone) return false;
  inviteDone = true;
  const ov = overlay(`<div class="cn-mid"></div>`);
  const mid = ov.querySelector(".cn-mid");
  const finish = result => { forget(); ov.remove(); off(); if (onDone) try { onDone(result); } catch {} };
  let busy = false;
  const off = (() => {
    // Signing in on this card brings the user back here, so connect then.
    let live = true;
    cloud.onUser(u => { if (live && u && ov.isConnected) go(); });
    return () => { live = false; };
  })();

  function card(html, buttons){
    mid.innerHTML = html;
    for (const [label, cls, fn] of buttons){
      const b = document.createElement("button");
      b.type = "button";
      b.className = cls;
      b.textContent = label;
      tap(b, fn);
      mid.append(b);
    }
  }
  // Once the outcome is known the code is spent, even if the app is closed on this card.
  const dead = () => forget() || card(`<h2>This QR has expired.</h2><p class="cn-dim">Ask them to show it again.</p>`,
    [["OK", "primary cn-big", () => finish(null)]]);
  const trouble = e => card(`<h2>Couldn't connect.</h2><p class="cn-dim">${esc(e && e.code === "unavailable" ? "No signal. Try again when you have one." : (e && e.message) || e)}</p>`,
    [["Try again", "primary cn-big", go], ["Not now", "quiet", () => finish(null)]]);

  async function go(){
    if (busy) return;
    busy = true;
    mid.innerHTML = `<p class="cn-dim">Connecting…</p>`;
    try {
      if (!cloud.user){
        const inv = await cloud.account.lookupInvite(code);
        if (!inv) return dead();
        card(`<h2>Connect with ${esc(inv.name)}</h2>
          <p class="cn-dim">Sign in, and you'll be in each other's Friends in every sidequests app that has them.</p>`,
          [["Sign in with Google", "primary cn-big", () => cloud.signIn().catch(e => trouble(e))],
           ["Not now", "quiet", () => finish(null)]]);
        mid.prepend(avatar(null, 96, { name: inv.name }));
        return;
      }
      const r = await cloud.account.accept(code, app);
      if (!r) return dead();
      forget();
      if (r.self) return card(`<h2>That's your own QR.</h2><p class="cn-dim">Show it to someone else to connect.</p>`,
        [["OK", "primary cn-big", () => finish(r)]]);
      card(`<h2>${r.already ? "You're already connected with" : "You're connected with"} ${esc(r.name)}</h2>
        <p class="cn-dim">You're in each other's Friends now.</p>`, [["Done", "primary cn-big", () => finish(r)]]);
      mid.prepend(avatar(r.uid, 96, { name: r.name }));
    } catch (e){
      console.warn("[connect]", e);
      trouble(e);
    } finally { busy = false; }
  }
  go();
  return true;
}

// ---- My QR ----
function qrSvg(text){
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  const n = q.getModuleCount(), pad = 4;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + pad} ${r + pad}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + pad * 2} ${n + pad * 2}" shape-rendering="crispEdges" role="img" aria-label="QR code">
    <path fill="#000" d="${d}"/></svg>`;
}
function linkFor(app, code){
  const url = new URL(`../${app}/`, import.meta.url);
  if (cloud.mock) url.search = "mock";   // so a test tab opens the fake cloud too
  url.searchParams.set("i", code);
  return url.toString().replace("mock=&", "mock&");
}

function showQR({ app = "" } = {}){
  const ov = overlay(`
    <div class="cn-head"><span class="lbl">My QR</span><button type="button" class="quiet" data-k="close">Close</button></div>
    <div class="cn-mid">
      <div data-k="who"></div>
      <h2 data-k="name"></h2>
      <div class="cn-qr" data-k="qr" hidden></div>
      <p class="cn-dim" data-k="msg">Making your code…</p>
      <button type="button" class="quiet" data-k="copy" hidden>Copy link</button>
    </div>`);
  const q = s => ov.querySelector(`[data-k="${s}"]`);
  phone.fullscreen();
  phone.keepAwake(true);
  let unwatch = () => {}, timer = null;
  const close = () => { ov.remove(); unwatch(); clearTimeout(timer); phone.keepAwake(false); };
  tap(q("close"), close);

  const me = cloud.user;
  if (!me){ q("msg").textContent = "Sign in first."; return close; }
  cloud.account.me().then(p => {
    q("name").textContent = (p && p.name) || me.displayName || "";
    q("who").replaceChildren(avatar(me.uid, 72, p));
  }).catch(() => {});

  cloud.account.invite().then(code => {
    if (!ov.isConnected) return;
    const link = linkFor(app, code);
    q("qr").innerHTML = qrSvg(link);
    q("qr").hidden = false;
    q("msg").textContent = "Point their phone's camera at this. Lasts a day.";
    q("copy").hidden = false;
    ov.dataset.link = link;
    tap(q("copy"), () => {
      const done = () => { q("copy").textContent = "Copied"; };
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => { q("msg").textContent = link; });
      else q("msg").textContent = link;
    });
  }).catch(e => {
    console.warn("[connect] invite", e);
    q("msg").textContent = e && e.code === "unavailable" ? "Your code needs a signal the first time. Try again in a moment." : "Couldn't make your code: " + ((e && e.message) || e);
  });

  // Someone just scanned it: say who, then close.
  let seen = null;
  unwatch = cloud.account.watchFriends(list => {
    const uids = new Set(list.map(f => f.uid));
    if (seen === null){ seen = uids; return; }
    const fresh = list.find(f => !seen.has(f.uid));
    seen = uids;
    if (!fresh || !ov.isConnected) return;
    cloud.account.profile(fresh.uid).then(p => {
      if (!ov.isConnected) return;
      const mid = ov.querySelector(".cn-mid");
      mid.innerHTML = `<h2>Connected with ${esc((p && p.name) || "them")}</h2><p class="cn-dim">You're in each other's Friends now.</p>`;
      mid.prepend(avatar(fresh.uid, 96, p));
      if (navigator.vibrate) navigator.vibrate(30);
      timer = setTimeout(close, 4000);
    });
  }, e => { q("msg").textContent = "Couldn't watch for new friends: " + (e.code || e.message); });
  return close;
}

// ---- Friends ----
const when = t => t ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
function showFriends(){
  const ov = overlay(`
    <div class="cn-top">
      <div class="cn-head"><h2>Friends</h2><button type="button" class="quiet" data-k="close">Close</button></div>
      <input type="text" data-k="find" placeholder="Search" autocomplete="off" aria-label="Search friends" hidden>
      <ul class="rows" data-k="list"><li class="empty">Loading…</li></ul>
    </div>`);
  const q = s => ov.querySelector(`[data-k="${s}"]`);
  let friends = [], names = {}, open = null;
  const unwatch = cloud.account.watchFriends(list => {
    friends = list;
    Promise.all(list.map(f => cloud.account.profile(f.uid).then(p => { names[f.uid] = p; }))).then(paint);
    paint();
  }, e => { q("list").innerHTML = `<li class="empty">Couldn't load your friends: ${esc(e.code || e.message)}</li>`; });
  const close = () => { ov.remove(); unwatch(); };
  tap(q("close"), close);
  q("find").addEventListener("input", paint);

  function paint(){
    if (!ov.isConnected) return;
    const list = q("list"), find = q("find").value.trim().toLowerCase();
    q("find").hidden = friends.length < 6;
    const shown = friends.filter(f => !find || String((names[f.uid] || {}).name || "").toLowerCase().includes(find));
    list.innerHTML = "";
    if (!friends.length){ list.innerHTML = `<li class="empty">No friends yet. Open My QR and let them scan it.</li>`; return; }
    if (!shown.length){ list.innerHTML = `<li class="empty">Nobody called that.</li>`; return; }
    for (const f of shown){
      const p = names[f.uid];
      const li = document.createElement("li");
      li.className = "cn-row";
      li.append(avatar(f.uid, 44, p));
      const who = document.createElement("div");
      who.className = "who";
      who.innerHTML = `<div class="l1"></div><div class="l2"></div>`;
      who.firstChild.textContent = (p && p.name) || "…";
      who.lastChild.textContent = f.since ? "Since " + when(f.since) : "";
      li.append(who);
      tap(li, e => { if (e.target.closest("button")) return; open = open === f.uid ? null : f.uid; paint(); });
      if (open === f.uid){
        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "quiet warnbtn cn-rm";
        rm.textContent = "Remove";
        armed(rm, "Remove", `Remove ${(p && p.name) || "them"}? Tap again`, () => {
          rm.disabled = true;
          cloud.account.unfriend(f.uid).then(() => { open = null; }, e => { rm.disabled = false; rm.textContent = "Couldn't remove: " + (e.code || e.message); });
        });
        li.append(rm);
      }
      list.append(li);
    }
  }
  return close;
}

export const connect = { handleInvite, showQR, showFriends, avatar };
