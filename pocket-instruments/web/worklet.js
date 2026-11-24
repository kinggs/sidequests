// P4: the engine inside an AudioWorklet. The raw .wasm, no generated glue: the page sends the
// bytes, this compiles them here, grows the module's memory by one page and puts the engine
// and its buffers there (ENGINE.md §8), exactly as harness/trace.test.mjs does in Node.
//
// With `samples` each track can play the starter pack's sample in place of its code voice
// (D50), chosen by command (22) like any other. With `instrument` or `delay` the engine is
// lent effect 4's line (ABI 12, ENGINE.md §18): pi_delay_frames(sampleRate) floats in pages
// of their own after the samples', lent once after pi_init. The copies and a P4 run get none:
// they play no effect 4.
//
// Two uses, by what the page sends in processorOptions:
//   a run     { cmds, end }: commands at absolute frames, as a P2 harness sends them. At `end`
//             the events it captured are posted back and the node stops.
//   playing   no `end`: it runs until told to stop. Commands arrive as messages and land on
//             the next block's first frame.
// With `copies` (P7's count) that many whole engines run side by side on the same commands,
// each sequencing and sounding its own voice, and the block's cost is timed.
//
// With `instrument` (web/rhythm.html, Session 12) it is also the instrument's audio thread
// (ENGINE.md §8, §13, §14):
//   in   { cmds }: keys, sliders and edits, [type, a, b, value] each, as before.
//        { load }: snapshot bytes, loaded between blocks, in the same queue as the cmds (§8:
//                  on a channel of its own a load and an edit sent together can swap).
//        { mark }: also queued: the trace starts again here (the page's checks only).
//        { save }: post a snapshot now, whether or not the generation moved.
//        { trace }: post the trace since the last mark.
//   out  { view, taken }: the 64 bytes, when anything past the tick has changed, and at least
//                  sixty times a second while playing (§14).
//        { snapshot, taken, result }: when the generation has moved, at most four a second
//                  (§8); `result` is the load's, on the first one after a load.
//   `taken` counts queue entries (each command, load and mark) taken so far: a page that
//   counts what it sent knows when a view or snapshot holds all of it (§8).
//   `snapshot` in processorOptions is loaded before the first block, by its length read.
//
// SPDX-License-Identifier: MIT
const PAGE = 65536;
const EVENTS = 4096, CAP = 256, AUDIO = 7168, CMDS = 9216, CMDS_MAX = (PAGE - CMDS) / 12;
// The instrument's: the view (64 bytes) and a snapshot's room, between the mix (one channel,
// 128 frames, so 512 bytes from AUDIO) and the commands. 1472 bytes since Session 21, for
// snapshot version 4's 1464 (§20); the commands began at 8192, and the room was 448, until then.
const VIEW = 7680, VIEW_SIZE = 64, SNAP = 7744, SNAP_ROOM = CMDS - SNAP;
const TRACE_MAX = 65536; // numbers kept since a mark: four an event

class Engine extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = options.processorOptions;
    const instance = new WebAssembly.Instance(new WebAssembly.Module(o.wasm), {});
    this.pi = instance.exports;
    this.base = this.pi.memory.grow(1) * PAGE;
    // The engine sits before the events: 4 KiB of room (core/src/tests/rules.rs holds pi_size to it).
    if (this.pi.pi_size() > EVENTS) throw new Error(`the engine is ${this.pi.pi_size()} bytes, more than the ${EVENTS} before the events`);
    this.e = this.pi.pi_init(this.base, this.pi.pi_size(), sampleRate, o.seed);
    // D50: `samples`, sixteen ArrayBuffers of 16-bit mono at 44.1 kHz (or null), one a track,
    // copied once into pages of their own. The engine reads them from there for good.
    if (o.samples) {
      const total = o.samples.reduce((a, b) => a + (b ? b.byteLength : 0), 0);
      let at = this.pi.memory.grow(Math.ceil(total / PAGE)) * PAGE;
      o.samples.forEach((b, t) => {
        if (!b || !b.byteLength) return;
        new Uint8Array(this.pi.memory.buffer, at, b.byteLength).set(new Uint8Array(b));
        if (this.pi.pi_set_sample(this.e, t, at, b.byteLength / 2) !== 1) throw new Error(`track ${t}'s sample was refused`);
        at += b.byteLength + (b.byteLength & 1);
      });
    }
    // ABI 12: effect 4's line. Allocated here, before the first block, never on the audio
    // path; the page's rate does not change under a worklet, so it is lent once.
    if (o.instrument || o.delay) {
      const frames = this.pi.pi_delay_frames(sampleRate);
      const at = this.pi.memory.grow(Math.ceil((4 * frames) / PAGE)) * PAGE;
      if (this.pi.pi_set_delay(this.e, at, frames) !== 1) throw new Error("effect 4's line was refused");
    }
    // The other copies, one engine's size apart (pi_size, rounded to its alignment) in pages
    // of their own. It was a fixed 512 bytes until the drums took the engine past that.
    this.more = [];
    const extra = Math.max(0, (o.copies || 1) - 1);
    if (extra) {
      const align = this.pi.pi_align(), size = Math.ceil(this.pi.pi_size() / align) * align;
      const at = this.pi.memory.grow(Math.ceil((extra * size) / PAGE)) * PAGE;
      for (let i = 0; i < extra; i++) this.more.push(this.pi.pi_init(at + i * size, size, sampleRate, o.seed + 1 + i));
      if (this.more.includes(0)) throw new Error("an engine copy was refused its memory");
    }
    this.every = o.every || 375; // blocks between reports while playing
    this.spent = 0;              // milliseconds inside process(), summed
    this.peak = 0;               // the loudest sample since the last report (web/listen.mjs)
    this.clock = globalThis.performance && performance.now ? () => performance.now() : () => Date.now();
    this.abi = this.pi.pi_abi_version();
    this.cmds = o.cmds || []; // [frame, type, a, b, value], in order
    this.next = 0;
    this.end = o.end || 0;
    this.tick = !!o.tick;    // a host-made tick on every STEP, so a silent fixture can be heard
    this.ticking = 0;
    this.now = 0;
    this.blocks = 0;
    this.oddBlocks = 0;      // blocks that were not 128 frames
    this.trace = [];         // tick, type, track, step: four numbers an event
    this.inbox = [];
    this.done = false;
    this.instrument = !!o.instrument;
    this.taken = 0;          // queue entries taken: commands, loads and marks
    this.tracing = false;
    this.wantSave = false;
    this.wantTrace = false;
    this.lastView = null;
    this.viewAt = 0;         // the frame the last view was posted at
    this.snapAt = -Infinity; // the frame the last snapshot was posted at
    this.loadResult = null;  // the last load's result, until a snapshot carries it
    if (this.instrument) {
      if (o.snapshot) this.load(o.snapshot);
      this.gen = this.pi.pi_generation(this.e);
    }
    this.port.onmessage = (m) => {
      const d = m.data;
      if (d.stop) this.done = true;
      else if (d.cmds) this.inbox.push(...d.cmds);
      else if (d.load) this.inbox.push({ load: d.load });
      else if (d.mark) this.inbox.push({ mark: true });
      else if (d.save) this.wantSave = true;
      else if (d.trace) this.wantTrace = true;
    };
  }

  // Between blocks only (§8). The length read is passed, not PI_SNAPSHOT_SIZE: bytes past a
  // version's size are the host's (§8), so a longer buffer is cut to the room, which holds
  // a version 4 whole.
  load(buffer) {
    const bytes = new Uint8Array(buffer);
    const n = Math.min(bytes.length, SNAP_ROOM);
    new Uint8Array(this.pi.memory.buffer, this.base + SNAP, n).set(bytes.subarray(0, n));
    this.loadResult = this.pi.pi_load(this.e, this.base + SNAP, n);
  }

  // The view and the snapshot, after a block (§14, §8).
  publish() {
    const pi = this.pi;
    if (pi.pi_view(this.e, this.base + VIEW, VIEW_SIZE) !== VIEW_SIZE) throw new Error("pi_view wrote nothing");
    const view = new Uint8Array(pi.memory.buffer, this.base + VIEW, VIEW_SIZE);
    const playing = view[24] & 1;
    let moved = !this.lastView;
    for (let i = 4; !moved && i < VIEW_SIZE; i++) moved = view[i] !== this.lastView[i];
    if (moved || (playing && this.now - this.viewAt >= sampleRate / 60)) {
      this.lastView = view.slice();
      this.viewAt = this.now;
      this.port.postMessage({ view: this.lastView.buffer.slice(0), taken: this.taken });
    }
    const gen = pi.pi_generation(this.e);
    if (this.wantSave || this.loadResult !== null || (gen !== this.gen && this.now - this.snapAt >= sampleRate / 4)) {
      const n = pi.pi_save(this.e, this.base + SNAP, SNAP_ROOM);
      const snapshot = new Uint8Array(pi.memory.buffer, this.base + SNAP, n).slice().buffer;
      this.port.postMessage({ snapshot, taken: this.taken, result: this.loadResult });
      this.gen = gen;
      this.snapAt = this.now;
      this.wantSave = false;
      this.loadResult = null;
    }
    if (this.wantTrace) {
      this.wantTrace = false;
      this.port.postMessage({ trace: this.trace.slice() });
    }
  }

  put(v, i, c) {
    const p = this.base + CMDS + 12 * i;
    v.setUint32(p, c[0], true);
    v.setUint8(p + 4, c[1]);
    v.setUint8(p + 5, c[2]);
    v.setUint8(p + 6, c[3]);
    v.setUint8(p + 7, 0);
    v.setUint32(p + 8, c[4], true);
  }

  process(inputs, outputs) {
    const out = outputs[0][0];
    if (this.done || !this.e || !out) return false;
    const frames = this.end ? Math.min(out.length, this.end - this.now) : out.length;
    if (out.length !== 128) this.oddBlocks++;
    const began = this.clock();
    const v = new DataView(this.pi.memory.buffer);
    let count = 0;
    if (this.instrument) {
      // A load at the front runs now, between blocks; one behind commands waits for the next
      // block (§8: pi_process with no frames applies nothing, so they cannot be flushed first).
      while (this.inbox.length && this.inbox[0].load) {
        this.load(this.inbox.shift().load);
        this.taken++;
      }
      let i = 0;
      for (; i < this.inbox.length && count < CMDS_MAX / 2; i++) {
        const c = this.inbox[i];
        if (c.load) break;
        if (c.mark) { this.trace = []; this.tracing = true; continue; }
        this.put(v, count++, [0, c[0], c[1], c[2], c[3]]);
      }
      this.inbox.splice(0, i);
      this.taken += i;
    } else for (const c of this.inbox.splice(0, CMDS_MAX / 2)) this.put(v, count++, [0, c[0], c[1], c[2], c[3]]);
    for (; this.next < this.cmds.length && this.cmds[this.next][0] < this.now + frames && count < CMDS_MAX; this.next++) {
      const c = this.cmds[this.next];
      this.put(v, count++, [c[0] - this.now, c[1], c[2], c[3], c[4]]);
    }
    const got = this.pi.pi_process(this.e, frames, this.base + CMDS, count, this.base + EVENTS, CAP, this.base + AUDIO, 1);
    const audio = new Float32Array(this.pi.memory.buffer, this.base + AUDIO, frames);
    out.set(audio);
    if (this.more.length) {
      // Every copy really renders; the sum is scaled back so the level does not climb.
      for (const e of this.more) {
        this.pi.pi_process(e, frames, this.base + CMDS, count, this.base + EVENTS, CAP, this.base + AUDIO, 1);
        for (let f = 0; f < frames; f++) out[f] += audio[f];
      }
      const scale = 1 / (this.more.length + 1);
      for (let f = 0; f < frames; f++) out[f] *= scale;
    }
    const steps = [];
    for (let i = 0; i < got; i++) {
      const p = this.base + EVENTS + 12 * i;
      const type = v.getUint8(p + 8);
      if (this.end || (this.tracing && this.trace.length < TRACE_MAX)) this.trace.push(v.getUint32(p + 4, true), type, v.getUint8(p + 9), v.getUint8(p + 10));
      if (type === 1) steps.push(v.getUint32(p, true));
    }
    if (this.tick) {
      // Thirty-two frames of a falling ramp from each STEP's own frame.
      let s = 0;
      for (let f = 0; f < frames; f++) {
        if (s < steps.length && steps[s] === f) { this.ticking = 32; s++; }
        if (this.ticking) out[f] += 0.4 * (this.ticking-- / 32) * (this.ticking & 1 ? 1 : -1);
      }
    }
    // The core's mix is near 1.0 with every drum at once and is not capped (D48). The output
    // clips hard at 1.0, so bend it there instead: tanh, which leaves a quiet mix almost as
    // it is. Host-side, so the same-bytes rule does not apply here.
    for (let f = 0; f < frames; f++) {
      const a = out[f] < 0 ? -out[f] : out[f];
      if (a > this.peak) this.peak = a; // before the bend: what the core gave
      out[f] = Math.tanh(out[f]);
    }
    this.now += frames;
    this.blocks++;
    if (this.instrument) this.publish();
    if (this.end && this.now >= this.end) {
      this.done = true;
      this.port.postMessage({
        trace: this.trace, dropped: this.pi.pi_dropped(this.e), frames: this.now, blocks: this.blocks,
        oddBlocks: this.oddBlocks, abi: this.abi, rate: sampleRate,
      });
      return false;
    }
    // While playing: where the audio clock has got to, once a second or so, for the page to
    // hold against its own clock. If audio stalls, frames fall behind time.
    this.spent += this.clock() - began;
    if (!this.end && this.blocks % this.every === 0) {
      this.port.postMessage({ frames: this.now, at: currentTime, spent: this.spent, peak: this.peak });
      this.peak = 0;
    }
    return true;
  }
}

registerProcessor("pi-engine", Engine);
