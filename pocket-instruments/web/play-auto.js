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
//
// SPDX-License-Identifier: MIT
const r = window.rhythm;
const phase = new URLSearchParams(location.search).get("auto");
const out = { phase, agent: navigator.userAgent, rate: r.ctx.sampleRate, failed: [], drawn: { checked: 0, bad: [] } };
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const u16 = (v, i) => v[i] | (v[i + 1] << 8);
const u32 = (v, i) => (v[i] | (v[i + 1] << 8) | (v[i + 2] << 16) | (v[i + 3] << 24)) >>> 0;
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

// ENGINE.md §14, "As text".
function viewText(v) {
  const f = v[24], h4 = (x) => x.toString(16).padStart(4, "0");
  return `view play=${f & 1} write=${(f >> 1) & 1} edges=${(f >> 2) & 1} sounds=${(f >> 4) & 1} ` +
    `step=${f & 8 ? v[25] : "-"} sel=${v[26]} vol=${v[27]} tempo=${u32(v, 4)} len=${v[28]} swing=${v[29]} ` +
    `held=${u32(v, 8).toString(16).padStart(6, "0")} field=${h4(u16(v, 12))} stitch=${h4(u16(v, 14))} bar=${h4(u16(v, 16))} ` +
    `sampled=${h4(u16(v, 18))} a=${u16(v, 20)} b=${u16(v, 22)} fires=${[...v.slice(32, 48)].join(",")}`;
}

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
  const bad = Object.keys(want).filter((k) => want[k] !== got[k]);
  if (bad.length && out.drawn.bad.length < 5) out.drawn.bad.push(`${bad.map((k) => `${k} drawn ${got[k]}, view ${want[k]}`).join("; ")} (${viewText(v)})`);
};

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

const PHASES = { 1: [phase1, "reload"], reload: [phaseReload, "bpm"], bpm: [phaseBpm, "latch"], latch: [phaseLatch, null] };
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
