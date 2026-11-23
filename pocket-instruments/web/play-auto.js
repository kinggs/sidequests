// web/rhythm.html's own checks, loaded only under ?auto. web/play.mjs opens the page and judges
// what each phase posts back; the bar is written there. Every press here is a PointerEvent on
// the drawn key, so it goes the way a finger goes. Sliders are moved through the page's own
// slide(), which its drag calls: a drag cannot aim at an exact value such as 40000.
//
// Three phases, one page load each, in one browser profile:
//   1       stopped, enter straight-sixteenths by keys; play; the trace. Two pointers choose a
//           sound. Then P6's browser half: clear, and enter it again while it plays; the
//           snapshot the page saved.
//   reload  the beat kept in the browser is back.
//   bpm     keys-bpm-family's edits and keys; the last view, as text.
//   latch   Ctrl+click latches (D60, D61), and the sounds sheet's two halves.
//   keep    §20 (D75, Session 21): the cap is the hand's and stays put when another sound
//           is chosen; a load moves it; a step keeps what it was written with, and the
//           second mark shows what the chosen sound was last hit with.
//   punch   §17 (Session 19): fx-repeat-punch (format 3) played on the page, fx and key 11
//           by touch, fx alone by the computer key; its views and its trace.
//   written keeps-what-it-was-written-with (format 4) by touch: its views.
//   fxlatch D78 by a mouse, fx + key by the computer keys, and the sounds sheet's "through
//           fx" switch (D69); each gesture held to the commands it sent.
//
// SPDX-License-Identifier: MIT
const r = window.rhythm;
const phase = new URLSearchParams(location.search).get("auto");
const out = { phase, agent: navigator.userAgent, rate: r.ctx.sampleRate, failed: [], drawn: { checked: 0, bad: [] } };
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const u16 = (v, i) => v[i] | (v[i + 1] << 8);
const u32 = (v, i) => (v[i] | (v[i + 1] << 8) | (v[i + 2] << 16) | (v[i + 3] << 24)) >>> 0;
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

// ENGINE.md §14, "As text"; format 3 adds §17's three fields, format 4 §20's two.
function viewText(v, format = 2) {
  const f = v[24], h4 = (x) => x.toString(16).padStart(4, "0");
  return `view play=${f & 1} write=${(f >> 1) & 1} edges=${(f >> 2) & 1} sounds=${(f >> 4) & 1} ` +
    `step=${f & 8 ? v[25] : "-"} sel=${v[26]} vol=${v[27]} tempo=${u32(v, 4)} len=${v[28]} swing=${v[29]} ` +
    `held=${u32(v, 8).toString(16).padStart(6, "0")} field=${h4(u16(v, 12))} stitch=${h4(u16(v, 14))} bar=${h4(u16(v, 16))} ` +
    `sampled=${h4(u16(v, 18))} a=${u16(v, 20)} b=${u16(v, 22)} fires=${[...v.slice(32, 48)].join(",")}` +
    (format >= 3 ? ` fx=${v[55]} fxsteps=${h4(u16(v, 56))} fxsounds=${h4(u16(v, 58))}` : "") +
    (format >= 4 ? ` ea=${u16(v, 60)} eb=${u16(v, 62)}` : "");
}

// Where a slider's cap sits for a value, from the track's height (design/DESIGN.md: the cap
// is 26 px tall and travels the rest).
const topFor = (which, value) => (1 - value / 65535) * Math.max(0, r.sliders[which].querySelector(".tr").clientHeight - 26);
let capWant = null; // where the hand is, when a phase moves it apart from the chosen sound's own

// Every drawing is read back off the face and held to the view it was drawn from. This reads
// the classes the CSS lights and rebuilds the masks; it shares nothing with draw().
r.afterDraw = (v) => {
  out.drawn.checked++;
  let field = 0, stitch = 0, bar = 0, held = 0, frames = [], latch = 0;
  r.keys.forEach((el, n) => {
    const c = el.classList;
    if (c.contains("on")) field |= 1 << n;
    if (c.contains("ghost")) stitch |= 1 << n;
    if (c.contains("bar")) bar |= 1 << n;
    if (c.contains("press")) held |= 1 << n;
    if (c.contains("play")) frames.push(n);
  });
  r.fkeys.forEach((el, i) => {
    if (el.classList.contains("press")) held |= 1 << (16 + i);
    if (el.classList.contains("latch")) latch |= 1 << (16 + i);
  });
  const f = v[24];
  const want = {
    field: u16(v, 12), stitch: u16(v, 14), bar: u16(v, 16), held: u32(v, 8),
    frames: f & 1 && f & 8 ? String(v[25]) : "", latch: (f & 1 ? 1 << 21 : 0) | (f & 2 ? 1 << 22 : 0),
  };
  const got = { field, stitch, bar, held, frames: frames.join(), latch };
  // D81: the effect block says byte 55, and is absent at 0; the lane's ticks are bytes 56 and
  // 57. D69: the sheet's "through fx" switches are bytes 58 and 59. Read off the face.
  const mark = document.getElementById("fxmark");
  want.fxmark = v[55] ? `fx ${v[55]}` : "none";
  got.fxmark = mark.hidden || getComputedStyle(mark).visibility === "hidden" ? "none" : mark.textContent;
  want.lane = u16(v, 56);
  got.lane = r.ticks.reduce((m, el, n) => m | (el.classList.contains("on") && getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)" ? 1 << n : 0), 0);
  want.through = u16(v, 58);
  got.through = r.sounds.reduce((m, row, t) => m | (row.fx.classList.contains("through") ? 1 << t : 0), 0);
  // §20: the second mark is drawn from bytes 60 to 63, always. The cap is drawn from 20 to
  // 23 while bpm is held; otherwise it is the hand's, which equals 20 to 23 unless a phase
  // says (capWant) where the hand is. Held only on a view that holds everything sent: a cap
  // moved by the hand is ahead of the view until then.
  for (const which of [0, 1]) {
    const key = which ? "b" : "a";
    want[`hit ${key}`] = topFor(which, u16(v, 60 + 2 * which)) + 12;
    got[`hit ${key}`] = parseFloat(r.sliders[which].querySelector(".hit").style.top);
    if (r.latest.taken >= r.sent) {
      const hand = !(u32(v, 8) & (1 << 18)) && capWant ? capWant[which] : u16(v, 20 + 2 * which);
      want[`cap ${key}`] = topFor(which, hand);
      got[`cap ${key}`] = parseFloat(r.sliders[which].querySelector(".cap").style.top);
    }
  }
  const bad = Object.keys(want).filter((k) => (typeof want[k] === "number" && k.includes(" ") ? Math.abs(want[k] - got[k]) > 0.01 : want[k] !== got[k]));
  if (bad.length && out.drawn.bad.length < 5) out.drawn.bad.push(`${bad.map((k) => `${k} drawn ${got[k]}, view ${want[k]}`).join("; ")} (${viewText(v, 4)})`);
  white(v);
};

// Session 20 (D82 item 4): the white, read off the face by its colour. ENGINE.md §14: a key
// is white under a finger, or, while the grid is sounds, for half a step at the view's tempo
// (40 to 120 ms) after its count in `fires` moves. This keeps its own record of when each
// count moved, from the views drawn, and shares nothing with draw(). A drawing that falls
// within 15 ms of a white's end is not judged (the page and this read the clock a moment
// apart). `white.lit` counts drawings where a key the field lights is white from a firing;
// `white.back` counts a lit key drawn ecru again after that: lit, white, lit.
const WHITE = "rgb(255, 255, 255)", ECRU = "rgb(242, 232, 208)";
const seenFires = new Array(16).fill(null), firedAt = new Array(16).fill(-1e9), wasWhite = new Array(16).fill(false);
out.white = { lit: 0, back: 0, bad: [] };
function white(v) {
  const now = performance.now(), sounds = v[24] & 16, field = u16(v, 12), held = u32(v, 8);
  const span = Math.max(40, Math.min(120, 7500000 / Math.max(1, u32(v, 4))));
  r.keys.forEach((el, n) => {
    const f = v[32 + n];
    if (seenFires[n] !== null && f !== seenFires[n] && sounds) firedAt[n] = now;
    seenFires[n] = f;
    if ((held >> n) & 1) return; // a finger's white is held to `held` above
    const bg = getComputedStyle(el).backgroundColor, lit = (field >> n) & 1, left = firedAt[n] + span - now;
    const want = sounds && left > 0;
    if (Math.abs(left) > 15 && (bg === WHITE) !== !!want && out.white.bad.length < 5)
      out.white.bad.push(`key ${n + 1} drawn ${bg}, ${want ? "white" : "not white"} wanted (${Math.round(left)} ms of white left; ${viewText(v, 4)})`);
    if (bg === WHITE && lit) out.white.lit++;
    if (bg === ECRU && lit && wasWhite[n]) out.white.back++;
    wasWhite[n] = bg === WHITE && !!lit;
  });
}

// Pointers, as a finger gives them.
function pointer(el, type, id) {
  el.dispatchEvent(new PointerEvent(type, { pointerId: id, bubbles: true, cancelable: true, isPrimary: false, pointerType: "touch" }));
}
const hold = (el, id) => pointer(el, "pointerdown", id);
const lift = (el, id) => pointer(el, "pointerup", id);
const tap = (el, id) => { hold(el, id); lift(el, id); };
const keyEl = (k) => (k < 16 ? r.keys[k] : r.fkeys[k - 16]);

// A view that holds everything sent so far (and, if asked, says something more).
async function settle(pred = () => true, what = "a view", ms = 8000) {
  for (let t = 0; t < ms / 10; t++) {
    const v = r.latest.view;
    if (v && r.latest.taken >= r.sent && pred(v)) return v;
    await sleep(10);
  }
  throw new Error(`timed out waiting for ${what}`);
}
async function snapshot(ms = 8000) {
  for (let t = 0; t < ms / 10; t++) {
    if (r.latest.snapshot && r.latest.snapTaken >= r.sent) return r.latest.snapshot;
    await sleep(10);
  }
  throw new Error("timed out waiting for a snapshot holding every press");
}
const next = (key) => new Promise((res) => r.listeners.push(function f(d) {
  if (d[key] !== undefined) { r.listeners.splice(r.listeners.indexOf(f), 1); res(d); }
}));

// straight-sixteenths' pattern, by keys, write on: choose each sound, tap its steps.
const PATTERN = [[0, [0, 4, 8, 12]], [1, [4, 12]], [2, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]]];
let pid = 100;
async function choose(t) {
  const s = pid++, k = pid++;
  hold(r.fkeys[0], s);
  tap(r.keys[t], k);
  lift(r.fkeys[0], s);
  await settle((v) => v[26] === t, `sound ${t + 1} chosen`);
}
async function enter() {
  for (const [t, steps] of PATTERN) {
    await choose(t);
    for (const s of steps) tap(r.keys[s], pid++);
    await settle();
  }
  await choose(0);
}
const traceLines = (t) => {
  const lines = [];
  for (let i = 0; i < t.length; i += 4)
    lines.push(t[i + 1] === 1 ? `${t[i]} step ${t[i + 3]}` : t[i + 1] === 2 ? `${t[i]} trig ${t[i + 2]} ${t[i + 3]}` : `${t[i]} unknown ${t[i + 1]}`);
  return lines;
};

async function phase1() {
  try { localStorage.clear(); } catch {}
  await r.ready;
  // As a phone is before its first touch: no audio thread running. The touch must start it
  // and count as a press.
  await r.ctx.suspend();
  tap(r.fkeys[6], 1);
  const v0 = await settle((v) => v[24] & 2, "write on after the first touch");
  // Firefox can report "running" a moment after the first block has run.
  for (let i = 0; i < 50 && r.ctx.state !== "running"; i++) await sleep(10);
  out.firstTouch = { state: r.ctx.state, write: !!(v0[24] & 2) };

  await enter();
  // The audio clock against the page's from play to stop, for P6's "no dropout".
  const clocks = [];
  r.listeners.push((d) => { if (d.frames !== undefined) clocks.push([d.frames, performance.now()]); });
  r.post({ mark: true });
  tap(r.fkeys[5], pid++); // play: RESET then PLAY 1 (§13), so ticks start at 0
  await settle((v) => v[24] & 1 && u32(v, 0) >= 32 * 96 + 48, "two bars played", 15000);
  r.post({ trace: true });
  const t = (await next("trace")).trace;
  out.trace = traceLines(t).filter((l) => +l.split(" ")[0] < 32 * 96);

  // Two pointers at once: sound held, a key pressed. Then both up, and nothing stays held.
  hold(r.fkeys[0], 61);
  hold(r.keys[5], 62);
  const v2 = await settle((v) => (u32(v, 8) & 0x10020) === 0x10020, "sound and key 6 held together");
  out.two = { sel: v2[26], held: u32(v2, 8) };
  lift(r.keys[5], 62);
  lift(r.fkeys[0], 61);
  out.two.after = u32(await settle((v) => u32(v, 8) === 0, "nothing held"), 8);

  // P6's browser half: clear while it plays, enter the pattern again by keys while it plays.
  hold(r.fkeys[3], 71);
  hold(r.fkeys[1], 72);
  lift(r.fkeys[1], 72);
  lift(r.fkeys[3], 71);
  await settle((v) => u16(v, 12) === 0 && u16(v, 14) === 0 && u32(v, 8) === 0, "the pattern cleared");
  await enter();
  const v3 = await settle();
  const snap = await snapshot();
  let stored = null;
  try { stored = localStorage.getItem("pocket-instruments/rhythm/beat"); } catch {}
  out.p6 = {
    playing: !!(v3[24] & 1), hex: hex(snap), stored: stored ? hex(Uint8Array.from(atob(stored), (c) => c.charCodeAt(0))) : null,
    // How far the audio clock fell behind the page's while it played.
    behindMs: clocks.length > 1 ? Math.round((clocks.at(-1)[1] - clocks[0][1]) - ((clocks.at(-1)[0] - clocks[0][0]) / r.ctx.sampleRate) * 1000) : null,
    seconds: clocks.length > 1 ? +((clocks.at(-1)[1] - clocks[0][1]) / 1000).toFixed(1) : 0,
  };
  tap(r.fkeys[5], pid++); // stop
  await settle((v) => !(v[24] & 1), "stopped");
  sessionStorage.setItem("pi-play-hex", out.p6.stored || "");
}

async function phaseReload() {
  await r.ready;
  await r.ctx.resume();
  for (let i = 0; i < 800 && r.latest.loaded === null; i++) await sleep(10);
  const saved = next("snapshot");
  r.post({ save: true });
  out.reload = { loaded: r.latest.loaded, hex: hex((await saved).snapshot), before: sessionStorage.getItem("pi-play-hex") };
}

async function phaseBpm() {
  await r.ready;
  await r.ctx.resume();
  const fx = await (await fetch("../fixtures/keys-bpm-family.json")).json();
  const ids = {};
  for (const c of fx.commands) {
    if (c.cmd === "step") r.send([16, c.track, c.step, c.value]);
    else if (c.cmd === "key_down") hold(keyEl(c.key), (ids[c.key] = pid++));
    else if (c.cmd === "key_up") lift(keyEl(c.key), ids[c.key]);
    else if (c.cmd === "param") r.slide(c.slider, c.value);
    else throw new Error(`a command the page cannot send: ${c.cmd}`);
  }
  out.bpm = { last: viewText(await settle()), want: fx.views.at(-1).view };
}

// D61, by a mouse: Ctrl+click latches, a left-click on a key finishes. Each gesture's view
// is recorded as text; play.mjs holds each to what ENGINE.md §13 says it should be.
const mouse = (el, type, button, ctrlKey = false) => el.dispatchEvent(new PointerEvent(type, {
  pointerId: 1, bubbles: true, cancelable: true, isPrimary: true, pointerType: "mouse", button, ctrlKey,
  buttons: type === "pointerdown" ? 1 << (button === 2 ? 1 : 0) : 0,
}));
// The latched light is the page's own state, drawn on the next frame: wait two frames.
const DOUBLE_GAP = 350; // longer than the page's double-click window, so two pairs stay two
const frames2 = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
const ctrl = (el) => { mouse(el, "pointerdown", 0, true); mouse(el, "pointerup", 0, true); };
const rightClick = (el) => { mouse(el, "pointerdown", 2); mouse(el, "pointerup", 2); };
const click = (el) => { mouse(el, "pointerdown", 0); mouse(el, "pointerup", 0); };
async function phaseLatch() {
  await r.ready;
  await r.ctx.resume();
  const L = (out.latch = {});
  // Ctrl+click sound: held, and lit as latched. Click key 16: chosen, and nothing held.
  ctrl(r.fkeys[0]);
  let v = await settle((x) => u32(x, 8) & (1 << 16), "sound latched");
  L.soundHeld = u32(v, 8);
  await frames2();
  L.soundLit = r.fkeys[0].classList.contains("latched");
  click(r.keys[15]);
  v = await settle((x) => u32(x, 8) === 0, "the latch let go after key 16");
  L.chosen = v[26];
  await frames2();
  L.afterLit = r.fkeys[0].classList.contains("latched");
  // Ctrl+click bpm, two slider moves (they let nothing go), Ctrl+click bpm again: the tempo
  // is the slider's, not the next preset, because bpm was used.
  ctrl(r.fkeys[2]);
  await settle((x) => u32(x, 8) & (1 << 18), "bpm latched");
  r.slide(1, 40000);
  r.slide(0, 20000);
  v = await settle((x) => x[29] === 15, "swing 15");
  L.bpmStillHeld = !!(u32(v, 8) & (1 << 18));
  ctrl(r.fkeys[2]);
  v = await settle((x) => u32(x, 8) === 0, "bpm let go");
  L.tempo = u32(v, 4);
  // Clear by mouse: a step set, write on; Ctrl+click function, click pattern.
  r.send([16, 15, 0, 1]);
  click(r.fkeys[6]);
  v = await settle((x) => x[24] & 2 && u16(x, 12) === 1, "write on, step 1 of sound 16 lit");
  ctrl(r.fkeys[3]);
  click(r.fkeys[1]);
  v = await settle((x) => u32(x, 8) === 0, "function let go");
  L.fieldAfterClear = u16(v, 12);
  // A right-click does nothing (D61): nothing held, nothing latched.
  rightClick(r.fkeys[0]);
  await sleep(50);
  v = await settle();
  await frames2();
  L.afterRight = { held: u32(v, 8), lit: r.fkeys[0].classList.contains("latched") };
  // Ctrl+click on play is a plain press: it starts. Ctrl+click again stops it.
  ctrl(r.fkeys[5]);
  v = await settle((x) => x[24] & 1, "Ctrl+click on play started it");
  L.playAfterCtrl = { playing: v[24] & 1, held: u32(v, 8) };
  ctrl(r.fkeys[5]);
  await settle((x) => !(x[24] & 1), "stopped");
  // D63: a double-click puts a slider back. The chosen sound's A moved, then double-clicked:
  // 32768. With bpm held, A double-clicked: swing 0; B: 120 bpm.
  const dbl = (el) => { click(el); click(el); };
  r.slide(0, 10000);
  await settle((x) => u16(x, 20) === 10000, "slider A at 10000");
  dbl(r.sliders[0]);
  v = await settle((x) => u16(x, 20) === 32768, "slider A back to the middle");
  L.dblA = u16(v, 20);
  hold(r.fkeys[2], 990);
  r.slide(0, 30000);
  r.slide(1, 50000);
  await settle((x) => x[29] > 0 && u32(x, 4) !== 120000, "swing and tempo moved");
  await sleep(DOUBLE_GAP);
  dbl(r.sliders[0]);
  await sleep(DOUBLE_GAP);
  dbl(r.sliders[1]);
  v = await settle((x) => x[29] === 0 && u32(x, 4) === 120000, "swing 0 and 120 bpm");
  L.dblBpm = { swing: v[29], tempo: u32(v, 4) };
  lift(r.fkeys[2], 990);
  await settle((x) => u32(x, 8) === 0, "bpm let go");
  // The sheet: the name plays its sound and changes nothing; the switch changes it and plays it.
  const f = (x) => x[32 + 2];
  const before = f(await settle());
  r.sounds[2].name.click();
  v = await settle((x) => f(x) !== before, "the name of 3 fired it");
  L.nameFired = (f(v) - before + 256) % 256;
  L.nameSampled = u16(v, 18);
  r.sounds[2].sw.click();
  v = await settle((x) => u16(x, 18) & 4, "3 switched to its sample");
  L.switchFired = (f(v) - before + 256) % 256;
  L.switchSampled = u16(v, 18);
  await sleep(50);
  L.switchLabel = r.sounds[2].sw.textContent;
}

// §20 (D75). A beat saved before Session 21 has each sound's own sliders: here sound 1's A
// at 1000 and sound 2's at 60000, sound 2 on step 1, as a version 3 snapshot made from this
// page's own bytes. Loaded, the cap goes to sound 1's 1000 (a load moves it). Choosing
// sound 2 sounds it (§13) at its own 60000: the mark goes there, the cap stays at 1000. The
// hand then moves A to 20000 (every sound), write on, key 5 writes sound 2's step 5. Played,
// step 1 sounds at the 60000 it kept from the old beat and step 5 at 20000: the mark steps
// between them while the cap stays at 20000.
const crc32 = (bytes) => {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
};
async function phaseKeep() {
  await r.ready;
  await r.ctx.resume();
  const K = (out.keep = {});
  const saved = next("snapshot");
  r.post({ save: true });
  const now = new Uint8Array((await saved).snapshot);
  K.size = now.length;
  const v3 = now.slice(0, 408), d = new DataView(v3.buffer);
  d.setUint16(4, 3, true);
  d.setUint32(8, 392, true);
  for (let t = 0; t < 16; t++) d.setUint16(24 + 2 * t, 0, true); // no steps but one
  d.setUint16(24 + 2 * 1, 1, true);                              // sound 2, step 1
  for (let t = 0; t < 16; t++) { d.setUint16(312 + 4 * t, 32768, true); d.setUint16(314 + 4 * t, 32768, true); }
  d.setUint16(312, 1000, true);                                  // sound 1's A
  d.setUint16(316, 60000, true);                                 // sound 2's A
  v3[379] = 0;                                                   // sound 1 chosen
  d.setUint32(404, crc32(v3.subarray(0, 404)), true);
  r.post({ load: v3.buffer });
  let v = await settle((x) => u16(x, 20) === 1000 && x[26] === 0, "the old beat loaded");
  await frames2();
  K.loadedCap = Math.abs(parseFloat(r.sliders[0].querySelector(".cap").style.top) - topFor(0, 1000)) < 0.01;
  capWant = [1000, 32768]; // from here the hand is not the chosen sound's own
  await choose(1);
  v = await settle((x) => x[26] === 1 && u16(x, 60) === 60000, "sound 2 chosen and sounded");
  await frames2();
  K.chosen = { a: u16(v, 20), mark: u16(v, 60), capStayed: Math.abs(parseFloat(r.sliders[0].querySelector(".cap").style.top) - topFor(0, 1000)) < 0.01 };
  capWant = [20000, 32768];
  r.slide(0, 20000);
  tap(r.fkeys[6], pid++); // write on
  tap(r.keys[4], pid++);  // sound 2's step 5
  v = await settle((x) => u16(x, 20) === 20000 && x[24] & 2 && u16(x, 12) === 0b10001, "A at 20000, step 5 written");
  tap(r.fkeys[5], pid++); // play
  const marks = new Set();
  for (let i = 0; i < 300 && marks.size < 2; i++) {
    v = await settle((x) => x[24] & 1, "playing");
    if (v[32 + 1] > 1) marks.add(u16(v, 60));
    await sleep(10);
  }
  K.marks = [...marks].sort((a, b) => a - b);
  tap(r.fkeys[5], pid++); // stop
  await settle((x) => !(x[24] & 1), "stopped");
  const after = next("snapshot");
  r.post({ save: true });
  const s = new DataView((await after).snapshot);
  K.kept = { keep: s.getUint16(404 + 2, true), step1: [s.getUint16(436 + 4 * 16, true), s.getUint16(438 + 4 * 16, true)],
    step5: [s.getUint16(436 + 4 * 20, true), s.getUint16(438 + 4 * 20, true)] };
}

// Run steps as the views show them while playing: one more each time the playhead moves,
// from the first view after play that has a step (§14's flag 3). The last view of each run
// step is kept, because a fixture's view is read where its run step ends (fixtures/README.md).
function runSteps() {
  const t = { run: -1, last: null, views: [], waiters: [] };
  const f = (d) => {
    if (!d.view) return;
    const v = new Uint8Array(d.view);
    if (!(v[24] & 1) || !(v[24] & 8)) return;
    if (v[25] !== t.last) { t.run++; t.last = v[25]; }
    t.views[t.run] = v;
    t.waiters = t.waiters.filter(([n, res]) => (t.run >= n ? (res(), false) : true));
  };
  r.listeners.push(f);
  t.at = (n) => (t.run >= n ? Promise.resolve() : new Promise((res) => t.waiters.push([n, res])));
  t.stop = () => r.listeners.splice(r.listeners.indexOf(f), 1);
  return t;
}
// A fixture's edits as the page sends them: [type, a, b, value] (ENGINE.md §6).
const edit = (c) => ({ step: [16, c.track, c.step, c.value], length: [19, 0, 0, c.value], fxsound: [24, c.track, 0, c.value],
  fx: [23, c.step, 0, c.value], play: [5, 0, 0, c.value] })[c.cmd];
// The computer keys (D57 item 5), by the key's number: a press as a keyboard gives it.
const CODE = { 0: "Digit1", 1: "Digit2", 2: "Digit3", 10: "KeyD", 20: "KeyI" };
const kb = (type, k) => window.dispatchEvent(new KeyboardEvent(type, { code: CODE[k], bubbles: true, cancelable: true }));

// fx-repeat-punch (format 3, ENGINE.md §17), played on the page. A key lands within its run
// step, a few milliseconds after the view says the step began, as a fixture's lands a frame
// after: nothing in the fixture depends on which frame. The first pass's fx and key 11 by
// touch, the second pass's fx alone by the computer key `i`. Every view is held to the
// fixture's, as text, and the trace (its ticks counted from the first) to its `expect`.
async function phasePunch() {
  await r.ready;
  await r.ctx.resume();
  const fx = await (await fetch("../fixtures/fx-repeat-punch.json")).json();
  const P = (out.punch = { want: fx.views.map((x) => x.view), wantTrace: fx.expect });
  await settle();
  const t = runSteps();
  r.post({ mark: true });
  r.send(...fx.commands.filter((c) => c.at === 0).map((c) => {
    const e = edit(c);
    if (!e) throw new Error(`a step-0 command the page cannot send: ${c.cmd}`);
    return e;
  }));
  const ids = {};
  for (const c of fx.commands.filter((c) => c.at > 0)) {
    await t.at(c.at);
    const byKeys = c.at >= 8; // the first pass by touch, the rest by the computer keys
    if (c.cmd === "key_down") byKeys ? kb("keydown", c.key) : hold(keyEl(c.key), (ids[c.key] = pid++));
    else if (c.cmd === "key_up") byKeys ? kb("keyup", c.key) : lift(keyEl(c.key), ids[c.key]);
    else throw new Error(`a command the page cannot send: ${c.cmd}`);
  }
  await t.at(fx.steps);
  t.stop();
  r.post({ trace: true });
  const trace = traceLines((await next("trace")).trace);
  r.send([5, 0, 0, 0]);
  await settle((v) => !(v[24] & 1), "stopped");
  const first = trace.length ? +trace[0].split(" ")[0] : 0;
  P.trace = trace.map((l) => l.replace(/^\d+/, (n) => String(+n - first))).filter((l) => +l.split(" ")[0] < fx.steps * fx.ticks_per_step);
  P.got = fx.views.map((x) => (t.views[x.at] ? viewText(t.views[x.at], 3) : `no view at run step ${x.at}`));
}

// keeps-what-it-was-written-with (format 4, §20), by touch and the page's slide(): the three
// views while stopped, then play (the edit) and the views at the play's first and fifth steps,
// which are the fixture's run steps 4 and 8 (it plays from run step 4).
async function phaseWritten() {
  await r.ready;
  await r.ctx.resume();
  const fx = await (await fetch("../fixtures/keeps-what-it-was-written-with.json")).json();
  const W = (out.written = { want: fx.views.map((x) => x.view), got: [] });
  if (fx.views.map((x) => x.at).join() !== "0,1,2,4,8" || fx.commands.at(-1).cmd !== "play" || fx.commands.at(-1).at !== 4)
    throw new Error("keeps-what-it-was-written-with is not the fixture this phase was written for");
  await settle();
  const ids = {};
  for (const at of [0, 1, 2]) {
    for (const c of fx.commands.filter((c) => c.at === at)) {
      if (c.cmd === "key_down") hold(keyEl(c.key), (ids[c.key] = pid++));
      else if (c.cmd === "key_up") lift(keyEl(c.key), ids[c.key]);
      else if (c.cmd === "param") r.slide(c.slider, c.value);
      else throw new Error(`a command the page cannot send: ${c.cmd}`);
    }
    W.got.push(viewText(await settle(), 4));
  }
  const t = runSteps();
  r.send([5, 0, 0, 1]);
  await t.at(5);
  t.stop();
  W.got.push(viewText(t.views[0], 4), viewText(t.views[4], 4));
  r.send([5, 0, 0, 0]);
  await settle((v) => !(v[24] & 1), "stopped");
}

// D78 by a mouse, fx + key by the computer keys, and D69's switch. What each gesture sent is
// read from the page's own messages (rhythm.onPost), as "type a b value".
async function phaseFxLatch() {
  await r.ready;
  await r.ctx.resume();
  const X = (out.fxlatch = {});
  let log = [];
  r.onPost = (m) => { if (m.cmds) log.push(...m.cmds.map((c) => c.join(" "))); };
  const take = () => { const l = log; log = []; return l; };
  const latchedLit = (i) => r.fkeys[i].classList.contains("latched");
  // A beat to play over: sound 1 on every step. Play by the key.
  r.send(...Array.from({ length: 16 }, (_, s) => [16, 0, s, 1]));
  tap(r.fkeys[5], pid++);
  await settle((x) => x[24] & 1 && x[24] & 8, "playing");
  // fx + key by the computer keys: i, then d (key 11). Effect 11 is heard while both are down.
  take();
  kb("keydown", 20);
  kb("keydown", 10);
  let v = await settle((x) => x[55] === 11, "fx and key 11 by the computer keys");
  X.keys = { held: u32(v, 8), heard: v[55], sent: take() };
  kb("keyup", 10);
  kb("keyup", 20);
  await settle((x) => u32(x, 8) === 0, "the computer keys let go");
  X.keys.after = take();
  // An empty lane to start D78 from.
  r.send(...Array.from({ length: 16 }, (_, s) => [23, s, 0, 0]));
  await settle((x) => u16(x, 56) === 0, "the lane emptied");
  take();
  // D78 item 1: Ctrl+click fx latches it, lit, and sends nothing: fx alone would empty steps.
  ctrl(r.fkeys[4]);
  await frames2();
  v = await settle();
  X.latched = { lit: latchedLit(4), held: u32(v, 8), sent: take() };
  // Item 2: a click on key 2 sends fx down, then the key; effect 2 is heard. Held for
  // about three and a half steps, so the steps that arrive take it.
  mouse(r.keys[1], "pointerdown", 0);
  v = await settle((x) => x[55] === 2, "a click with fx latched punched effect 2");
  X.click1 = { held: u32(v, 8), sent: take() };
  await sleep(450);
  mouse(r.keys[1], "pointerup", 0);
  v = await settle((x) => u32(x, 8) === 0, "the click let go");
  await frames2();
  X.up1 = { lane: u16(v, 56), lit: latchedLit(4), sent: take() };
  // Item 3: over a bar and a bit with the latch on and nothing clicked, the lane replays
  // (effect 2 heard on its steps) and does not change.
  const heard = new Set(), lanes = new Set();
  const watch = (d) => { if (d.view) { const x = new Uint8Array(d.view); heard.add(x[55]); lanes.add(u16(x, 56)); } };
  r.listeners.push(watch);
  await sleep(2300);
  r.listeners.splice(r.listeners.indexOf(watch), 1);
  X.bar = { heard: [...heard].sort((a, b) => a - b), lanes: [...lanes], sent: take() };
  // The latch did not go after the first click: a second click punches effect 3.
  mouse(r.keys[2], "pointerdown", 0);
  v = await settle((x) => x[55] === 3, "the second click punched effect 3");
  X.click2 = { held: u32(v, 8), sent: take() };
  mouse(r.keys[2], "pointerup", 0);
  await settle((x) => u32(x, 8) === 0, "the second click let go");
  X.up2 = { sent: take() };
  // Item 5: Ctrl+click sound, click key 5: chosen, sound's latch gone, fx's still on.
  ctrl(r.fkeys[0]);
  click(r.keys[4]);
  v = await settle((x) => x[26] === 4 && u32(x, 8) === 0, "sound 5 chosen with fx latched");
  await frames2();
  X.sound = { sel: v[26], soundLit: latchedLit(0), fxLit: latchedLit(4) };
  take();
  // Ctrl+click fx again: off, and it sends nothing (fx was not down). A click on key 2 is
  // then a plain press: only the key goes down and up.
  ctrl(r.fkeys[4]);
  await frames2();
  X.off = { lit: latchedLit(4), sent: take() };
  click(r.keys[1]);
  await settle();
  X.off.click = take();
  tap(r.fkeys[5], pid++);
  await settle((x) => !(x[24] & 1), "stopped");
  take();
  // D69: the sheet's switch takes sound 4 out of the effects and puts it back (FXSOUND).
  r.sounds[3].fx.click();
  v = await settle((x) => u16(x, 58) === 0xfff7, "sound 4 out of the effects");
  await frames2();
  X.through = { off: u16(v, 58), sentOff: take(), lit: r.sounds[3].fx.classList.contains("through"), pressed: r.sounds[3].fx.getAttribute("aria-pressed") };
  r.sounds[3].fx.click();
  v = await settle((x) => u16(x, 58) === 0xffff, "sound 4 back through the effects");
  X.through.on = u16(v, 58);
  X.through.sentOn = take();
  r.onPost = null;
}

const PHASES = { 1: [phase1, "reload"], reload: [phaseReload, "bpm"], bpm: [phaseBpm, "latch"], latch: [phaseLatch, "keep"],
  keep: [phaseKeep, "punch"], punch: [phasePunch, "written"], written: [phaseWritten, "fxlatch"], fxlatch: [phaseFxLatch, null] };
const [run, then] = PHASES[phase] || [async () => { throw new Error(`no phase ${phase}`); }, null];
try {
  await run();
  await sleep(100); // the last drawing's check
} catch (e) {
  out.failed.push(String(e));
}
out.done = !then || out.failed.length > 0;
await fetch("/result", { method: "POST", body: JSON.stringify(out) });
if (!out.done) location.search = `?auto=${then}`;
