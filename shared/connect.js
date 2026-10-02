// shared/connect.js — the Connect part: My QR, scan to connect, Friends (KIT.md).
//
//   import { connect } from "../shared/connect.js";   // reads ?i=<code> the moment it loads
//   await cloud.init("rack-it");
//   connect.handleInvite({ app: "rack-it", onDone }); // first, before the app's own start
//   connect.showQR({ app: "rack-it" });               // My QR
//   connect.showFriends();                            // Friends: each one's card (note, met, tags), Remove
//   connect.showProfile({ onClose });                 // your name and photo; Delete my account
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
.cn-ov textarea{width:100%;font:inherit;font-size:1rem;color:var(--text,#e8edf3);background:var(--ink-2,#1b232e);border:none;
  border-radius:var(--r-ctl,14px);padding:14px;resize:vertical;-webkit-user-select:text;user-select:text}
.cn-ov textarea:focus{outline:2px solid var(--accent,#23d3b0)}
.cn-who{display:flex;justify-content:center;padding:4px 0}
.cn-add{display:flex;gap:10px}
.cn-add button{width:auto;padding:0 20px}
.cn-ov .chips button{width:auto;flex:0 1 auto;min-width:0;padding:0 18px}
.cn-warn{color:var(--warn,#ffc14d)}
.cn-leave{margin-top:28px;padding-top:16px;border-top:1px solid var(--line,rgba(232,237,243,.1));display:flex;flex-direction:column;gap:12px}
.cn-leave>div{display:flex;flex-direction:column;gap:12px}
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
      if (!r.self && !r.already) stampPlace(r.uid);
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
    // Your card for them: stamped now, since only the scanner's side was made with the pair.
    cloud.account.saveFriend(fresh.uid, { metAt: Date.now(), ...(lastPlace() ? { metPlace: lastPlace() } : {}) })
      .catch(e => console.warn("[connect] card", e));
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

// ---- Friends, and each friend's card ----
// The card is yours alone (profiles/<you>/friends/<them>): a note, when and where you met,
// and tags. Tags you've used are offered again, and filter the list.
const PLACE = "connect.place";   // the last place typed, offered for the next one
const lastPlace = () => { try { return localStorage.getItem(PLACE) || ""; } catch { return ""; } };
const keepPlace = p => { try { if (p) localStorage.setItem(PLACE, p); } catch {} };
const when = t => t ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
const whenFull = t => t ? new Date(t).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
const tagOf = t => String(t || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 24);
const tagsUsed = list => [...new Set(list.flatMap(f => f.tags || []))].sort();

// Stamp where you met on a new card, from the last place you typed.
function stampPlace(uid){
  const place = lastPlace();
  if (place) cloud.account.saveFriend(uid, { metPlace: place }).catch(e => console.warn("[connect] place", e));
}

function showFriends(){
  const ov = overlay(`
    <div class="cn-top">
      <div class="cn-head"><h2>Friends</h2><button type="button" class="quiet" data-k="close">Close</button></div>
      <input type="text" data-k="find" placeholder="Search" autocomplete="off" aria-label="Search friends" hidden>
      <div class="chips cn-tags" data-k="tags" hidden></div>
      <ul class="rows" data-k="list"><li class="empty">Loading…</li></ul>
    </div>`);
  const q = s => ov.querySelector(`[data-k="${s}"]`);
  let friends = [], names = {}, tag = "";
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
    const used = tagsUsed(friends);
    if (tag && !used.includes(tag)) tag = "";
    const box = q("tags");
    box.hidden = !used.length;
    box.replaceChildren(...used.map(t => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = t;
      b.setAttribute("aria-pressed", String(t === tag));
      tap(b, () => { tag = tag === t ? "" : t; paint(); });
      return b;
    }));
    const shown = friends.filter(f => (!find || String((names[f.uid] || {}).name || "").toLowerCase().includes(find))
      && (!tag || (f.tags || []).includes(tag)));
    list.innerHTML = "";
    if (!friends.length){ list.innerHTML = `<li class="empty">No friends yet. Open My QR and let them scan it.</li>`; return; }
    if (!shown.length){ list.innerHTML = `<li class="empty">Nobody matches.</li>`; return; }
    for (const f of shown){
      const p = names[f.uid];
      const li = document.createElement("li");
      li.append(avatar(f.uid, 44, p));
      const who = document.createElement("div");
      who.className = "who";
      who.innerHTML = `<div class="l1"></div><div class="l2"></div>`;
      who.firstChild.textContent = (p && p.name) || "…";
      who.lastChild.textContent = f.note || [f.metPlace, when(f.metAt || f.since)].filter(Boolean).join(" · ");
      li.append(who);
      tap(li, () => openCard(f, p, used));
      list.append(li);
    }
    const hint = document.createElement("li");
    hint.className = "empty";
    hint.textContent = "Tap someone for your note, where you met and tags.";
    list.append(hint);
  }
  return close;
}

function openCard(f, p, used){
  const name = (p && p.name) || "them";
  const ov = overlay(`
    <div class="cn-top">
      <div class="cn-head"><h2 data-k="name"></h2><button type="button" class="quiet" data-k="close">Close</button></div>
      <div class="cn-who" data-k="who"></div>
      <label class="lbl" for="cn-note">Note</label>
      <textarea id="cn-note" data-k="note" rows="3" maxlength="500" placeholder="Waiter, Tuesdays"></textarea>
      <span class="lbl">Met</span>
      <p data-k="met"></p>
      <input type="text" data-k="place" maxlength="60" placeholder="Where?" aria-label="Where you met" autocomplete="off">
      <span class="lbl">Tags</span>
      <div class="chips" data-k="tags"></div>
      <div class="cn-add"><input type="text" data-k="newtag" maxlength="24" placeholder="New tag" aria-label="New tag" autocomplete="off">
        <button type="button" class="quiet" data-k="addtag">Add</button></div>
      <p class="cn-dim">Only you see this card.</p>
      <button type="button" class="primary cn-big" data-k="save">Save</button>
      <button type="button" class="quiet warnbtn" data-k="remove">Remove</button>
      <p class="cn-warn" data-k="msg" hidden></p>
    </div>`);
  const q = s => ov.querySelector(`[data-k="${s}"]`);
  q("name").textContent = name;
  q("who").append(avatar(f.uid, 72, p));
  q("note").value = f.note || "";
  q("met").textContent = whenFull(f.metAt || f.since) || "Not stamped";
  q("place").value = f.metPlace || lastPlace();
  const chosen = new Set(f.tags || []);
  const offered = new Set([...used, ...chosen]);
  const paintTags = () => q("tags").replaceChildren(...[...offered].sort().map(t => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = t;
    b.setAttribute("aria-pressed", String(chosen.has(t)));
    tap(b, () => { chosen.has(t) ? chosen.delete(t) : chosen.add(t); paintTags(); });
    return b;
  }));
  paintTags();
  const addTag = () => {
    const t = tagOf(q("newtag").value);
    if (!t) return;
    offered.add(t); chosen.add(t);
    q("newtag").value = "";
    paintTags();
  };
  tap(q("addtag"), addTag);
  q("newtag").addEventListener("keydown", e => { if (e.key === "Enter") addTag(); });
  const say = m => { q("msg").hidden = !m; q("msg").textContent = m || ""; };
  const close = () => ov.remove();
  tap(q("close"), close);
  tap(q("save"), () => {
    addTag();
    const place = q("place").value.trim().slice(0, 60);
    keepPlace(place);
    cloud.account.saveFriend(f.uid, { note: q("note").value.trim().slice(0, 500), tags: [...chosen].slice(0, 12), metPlace: place })
      .then(close, e => say("Couldn't save: " + (e.code || e.message)));
  });
  armed(q("remove"), "Remove", `Remove ${name}? Tap again`, () => {
    cloud.account.unfriend(f.uid).then(close, e => say("Couldn't remove: " + (e.code || e.message)));
  });
  return close;
}

// ---- Your profile ----
// Your name and photo, as your friends see them. A photo is shrunk to a 192px JPEG and kept
// in the profile document (Firebase Storage would need the paid plan), so it must stay
// under the rule's 60,000 characters.
const PHOTO_MAX = 60000;
async function shrink(file){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => no(new Error("That file isn't a picture this phone can read."));
      i.src = url;
    });
    const S = 192, c = document.createElement("canvas");
    c.width = c.height = S;
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    c.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, S, S);
    for (const quality of [0.82, 0.7, 0.58, 0.45, 0.32]){
      const data = c.toDataURL("image/jpeg", quality);
      if (data.length <= PHOTO_MAX) return data;
    }
    throw new Error("That photo won't shrink small enough. Try another.");
  } finally { URL.revokeObjectURL(url); }
}

// Press and hold for 600ms (theme.css draws the fill), for what can't be undone.
function hold(btn, fn){
  let t = null;
  const stop = () => { clearTimeout(t); t = null; btn.classList.remove("holding"); };
  btn.addEventListener("pointerdown", () => { btn.classList.add("holding"); t = setTimeout(() => { stop(); fn(); }, 600); });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) btn.addEventListener(ev, stop);
  btn.addEventListener("click", e => e.preventDefault());
  btn.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
}

function showProfile({ onClose } = {}){
  const ov = overlay(`
    <div class="cn-top">
      <div class="cn-head"><h2>Profile</h2><button type="button" class="quiet" data-k="close">Close</button></div>
      <div class="cn-who" data-k="who"></div>
      <label class="lbl" for="cn-name">Name</label>
      <input type="text" id="cn-name" data-k="name" maxlength="60" autocomplete="off">
      <input type="file" data-k="file" accept="image/*" capture="user" hidden>
      <button type="button" class="quiet" data-k="pick">Take or pick a photo</button>
      <button type="button" class="quiet" data-k="google" hidden>Use my Google photo</button>
      <p class="cn-dim">Your name and photo show to the people you connect with.</p>
      <button type="button" class="primary cn-big" data-k="save" disabled>Save</button>
      <p class="cn-warn" data-k="msg" hidden></p>
      <div class="cn-leave">
        <button type="button" class="quiet warnbtn hold" data-k="hold">Hold to delete my account</button>
        <div data-k="confirm" hidden>
          <p class="cn-dim">This removes your profile, photo, friends, notes and guests, then signs you out.
            Matches you played keep your name. Type DELETE to go ahead.</p>
          <input type="text" data-k="typed" autocomplete="off" autocapitalize="characters" aria-label="Type DELETE">
          <button type="button" class="warnbtn" data-k="delete" disabled>Delete my account</button>
        </div>
      </div>
    </div>`);
  const q = s => ov.querySelector(`[data-k="${s}"]`);
  const say = m => { q("msg").hidden = !m; q("msg").textContent = m || ""; };
  const close = () => { ov.remove(); if (onClose) try { onClose(); } catch {} };
  tap(q("close"), close);
  const u = cloud.user;
  if (!u){ say("Sign in first."); return close; }

  let me = null, photo;   // photo: undefined = unchanged, "" = back to Google's, data URL = new
  const preview = () => {
    const shown = photo === undefined ? me && me.photo : (photo || (me && me.googlePhoto) || "");
    q("who").replaceChildren(avatar(null, 96, { name: q("name").value || (me && me.name), photo: shown }));
    q("google").hidden = !(me && me.googlePhoto) || (photo === undefined ? !(me && me.photo && me.photo !== me.googlePhoto) : !photo);
  };
  const ready = () => { q("save").disabled = !q("name").value.trim(); };
  cloud.account.me().then(p => {
    me = p || { name: u.displayName || "", photo: u.photoURL || "", googlePhoto: u.photoURL || "" };
    q("name").value = me.name;
    preview(); ready();
  }).catch(e => say("Couldn't load your profile: " + (e.code || e.message)));
  q("name").addEventListener("input", ready);

  tap(q("pick"), () => q("file").click());
  q("file").addEventListener("change", async () => {
    const f = q("file").files[0];
    q("file").value = "";
    if (!f) return;
    say("");
    try { photo = await shrink(f); preview(); } catch (e){ say(e.message); }
  });
  tap(q("google"), () => { photo = ""; preview(); });
  tap(q("save"), () => {
    const fields = { name: q("name").value.trim() };
    if (photo !== undefined) fields.photo = photo;
    q("save").disabled = true;
    cloud.account.saveMe(fields).then(close, e => { ready(); say("Couldn't save: " + (e.code || e.message)); });
  });

  hold(q("hold"), () => { q("hold").hidden = true; q("confirm").hidden = false; q("typed").focus(); });
  q("typed").addEventListener("input", () => { q("delete").disabled = q("typed").value.trim().toUpperCase() !== "DELETE"; });
  tap(q("delete"), async () => {
    if (q("delete").disabled) return;
    q("delete").disabled = true;
    say("Deleting…");
    try {
      await cloud.account.deleteMe();
      try { localStorage.removeItem(PLACE); } catch {}
      ov.remove();
      const done = overlay(`<div class="cn-mid"><h2>Your account is deleted.</h2>
        <p class="cn-dim">Signing in again starts a new one.</p></div>`);
      const ok = document.createElement("button");
      ok.type = "button"; ok.className = "primary cn-big"; ok.textContent = "OK";
      tap(ok, () => { done.remove(); if (onClose) try { onClose(); } catch {} });
      done.querySelector(".cn-mid").append(ok);
    } catch (e){
      say("Couldn't finish deleting: " + (e.code || e.message) + ". Try again; what's gone stays gone.");
      q("delete").disabled = false;
    }
  });
  return close;
}

export const connect = { handleInvite, showQR, showFriends, showProfile, avatar };
