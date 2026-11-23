//! P2, natively: every fixture, on both clock sources, at three sample rates and three block
//! sizes, compared byte for byte. `fixtures/README.md` says how a harness runs one; the Node
//! and C++ harnesses in `harness/` do the same and write the same report.
//! Format 2 adds keys, sliders and views (Session 10); format 3 the effects (Session 16);
//! format 4 a step's own sliders (Session 21).

use super::json::{Json, parse};
use super::*;
use std::fmt::Write as _;

pub const RATES: [u32; 3] = [44_100, 48_000, 96_000];
pub const BLOCKS: [u32; 3] = [1, 128, 512];
const SOURCES: [(&str, u32); 2] = [("table", 0), ("edges", 1)];

fn fixtures() -> Vec<(String, Json)> {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../fixtures");
    let mut names: Vec<String> = std::fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().into_string().unwrap())
        .filter(|n| n.ends_with(".json"))
        .collect();
    names.sort();
    assert!(names.len() >= 10, "expected the ten fixtures, found {names:?}");
    names
        .into_iter()
        .map(|n| {
            let j = parse(&std::fs::read_to_string(format!("{dir}/{n}")).unwrap());
            assert!(matches!(j.num("format"), 1..=4), "{n}");
            assert!(j.num("format") >= 2 || j.get("views").is_none(), "{n}: views are format 2's to 4's");
            assert_eq!(j.num("ticks_per_step"), 96, "{n}");
            (n.trim_end_matches(".json").to_string(), j)
        })
        .collect()
}

fn is_edit(name: &str) -> bool {
    matches!(name, "step" | "prob" | "swing" | "length" | "fx" | "fxsound" | "keep")
}

/// Format 2: what a finger did. These land a frame after their step's boundary.
fn is_key(name: &str) -> bool {
    matches!(name, "key_down" | "key_up" | "param")
}

fn to_cmd(c: &Json) -> Cmd {
    let t = |k| c.num_or(k, 0) as u8;
    let v = c.num_or("value", 0) as u32;
    match c.str("cmd") {
        "play" => cmd(CMD_PLAY, 0, 0, v),
        "reset" => cmd(CMD_RESET, 0, 0, 0),
        "step" => cmd(CMD_STEP, t("track"), t("step"), v),
        "prob" => cmd(CMD_PROB, t("track"), t("step"), v),
        "swing" => cmd(CMD_SWING, 0, 0, v),
        "length" => cmd(CMD_LENGTH, 0, 0, v),
        "fx" => cmd(CMD_FX, t("step"), 0, v),
        "fxsound" => cmd(CMD_FXSOUND, t("track"), 0, v),
        "keep" => cmd(CMD_KEEP, t("track"), t("step"), (c.num("a") as u32) << 16 | c.num("b") as u32),
        "key_down" => cmd(CMD_KEY_DOWN, t("key"), 0, 0),
        "key_up" => cmd(CMD_KEY_UP, t("key"), 0, 0),
        "param" => cmd(CMD_PARAM, t("slider"), 0, v),
        other => panic!("unknown fixture command {other}"),
    }
}

/// What to send and when: the commands at absolute frames, the frame each run step falls
/// on, the frame the run ends before, and each view to read: the frame its block ends on and
/// the text expected there.
struct Plan {
    format: u64,
    cmds: Vec<(u64, Cmd)>,
    step_frames: Vec<u64>,
    end: u64,
    views: Vec<(u64, String)>,
}

fn schedule(fx: &Json, rate: u32, source: u32, from_snapshot: bool) -> Plan {
    let mbpm = fx.num("mbpm");
    let steps = fx.num("steps");
    let f = |n: u64| (n * rate as u64 * 15_000).div_ceil(mbpm);
    let (mut anchor, mut anchor_step) = (0u64, 0u64);
    let mut cmds = Vec::new();
    let mut step_frames = Vec::new();

    if !from_snapshot {
        cmds.push((0, cmd(CMD_TEMPO, 0, 0, mbpm as u32)));
    }
    cmds.push((0, cmd(CMD_SOURCE, 0, 0, source)));
    for m in 0..steps {
        let at = anchor + f(m - anchor_step);
        step_frames.push(at);
        for c in fx.arr("commands").iter().filter(|c| c.num("at") == m && !is_key(c.str("cmd"))) {
            let name = c.str("cmd");
            if from_snapshot && m == 0 && is_edit(name) {
                continue; // the snapshot carries these
            }
            cmds.push((at, to_cmd(c)));
            if name == "reset" {
                (anchor, anchor_step) = (at, m);
            }
        }
        if source == 1 {
            cmds.push((at, cmd(CMD_CLOCK, 0, 0, 0)));
        }
        // Keys and sliders: one frame on, so the step's tick 0 is behind them on both
        // sources (fixtures/README.md, format 2).
        for c in fx.arr("commands").iter().filter(|c| c.num("at") == m && is_key(c.str("cmd"))) {
            cmds.push((at + 1, to_cmd(c)));
        }
    }
    let end = anchor + f(steps - anchor_step);
    // A view is read where its run step ends: on the frame the next one falls on.
    let views = fx
        .get("views")
        .map(|_| fx.arr("views"))
        .unwrap_or(&[])
        .iter()
        .map(|v| {
            let at = v.num("at") as usize;
            assert!(at < steps as usize, "a view past the end of the run");
            let frame = step_frames.get(at + 1).copied().unwrap_or(end);
            // Written for the table run; the edges run differs in that one flag.
            let text = if source == 1 { v.str("view").replace(" edges=0 ", " edges=1 ") } else { v.str("view").to_string() };
            (frame, text)
        })
        .collect();
    Plan { format: fx.num("format"), cmds, step_frames, end, views }
}

/// Runs a plan in blocks of `block`, ending a block wherever a view is to be read. Returns
/// the events and the report's text: the trace, then the views.
fn play(h: &mut Host, plan: &Plan, block: u32, label: &str) -> (Vec<(u64, Event)>, String) {
    let mut events = Vec::new();
    let mut views = String::new();
    for (frame, want) in &plan.views {
        events.extend(h.run(frame - h.now, block, &plan.cmds));
        let got = match plan.format {
            4.. => view_text_keep(&h.view()),
            3 => view_text_fx(&h.view()),
            _ => view_text(&h.view()),
        };
        assert_eq!(&got, want, "{label}: the view at frame {frame}");
        views.push_str(&got);
        views.push('\n');
    }
    events.extend(h.run(plan.end - h.now, block, &plan.cmds));
    let text = trace(&events) + &views;
    (events, text)
}

fn expect(fx: &Json) -> String {
    fx.arr("expect")
        .iter()
        .map(|l| match l {
            Json::Str(s) => format!("{s}\n"),
            _ => panic!("expect holds strings"),
        })
        .collect()
}

/// A snapshot of the fixture's pattern, taken from an engine that was given the tempo and
/// the step-0 edits and nothing else.
fn snapshot_of(fx: &Json, rate: u32) -> [u8; SNAP] {
    let mut a = Host::new(rate, fx.num("seed") as u32);
    let mut cmds = vec![cmd(CMD_TEMPO, 0, 0, fx.num("mbpm") as u32)];
    cmds.extend(
        fx.arr("commands").iter().filter(|c| c.num("at") == 0 && is_edit(c.str("cmd"))).map(to_cmd),
    );
    a.block(1, &cmds);
    a.save()
}

/// §20: the same pattern as a player's keys would leave it: every step that is on keeps its
/// sound's own A and B, as a write-mode key keeps them and as an older snapshot loads. (An
/// edit's `STEP` keeps nothing.) So the report holds the bytes a page or a module saves after
/// a beat was entered by keys, and each harness plays the fixture from them (P6).
fn kept_snapshot_of(fx: &Json, rate: u32) -> [u8; SNAP] {
    let mut a = Host::new(rate, fx.num("seed") as u32);
    a.load(&snapshot_of(fx, rate));
    let s = a.save();
    let mut keeps = Vec::new();
    for t in 0..16usize {
        let on = u16::from_le_bytes([s[24 + 2 * t], s[25 + 2 * t]]);
        let kept = u16::from_le_bytes([s[404 + 2 * t], s[405 + 2 * t]]);
        let ab = u32::from_le_bytes([s[314 + 4 * t], s[315 + 4 * t], s[312 + 4 * t], s[313 + 4 * t]]);
        for st in (0..16u8).filter(|st| on >> st & 1 == 1 && kept >> st & 1 == 0) {
            keeps.push(cmd(CMD_KEEP, t as u8, st, ab));
        }
    }
    a.block(1, &keeps);
    a.save()
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

#[test]
fn every_fixture_everywhere() {
    let mut report = String::new();
    let mut runs = 0;
    let all = fixtures();
    let count = all.len();
    for (name, fx) in all {
        let want = expect(&fx);
        for (source_name, source) in SOURCES {
            for rate in RATES {
                for block in BLOCKS {
                    let label = format!("{name} {source_name} {rate} {block}");
                    let plan = schedule(&fx, rate, source, false);
                    let mut h = Host::new(rate, fx.num("seed") as u32);
                    let (events, text) = play(&mut h, &plan, block, &label);
                    assert_eq!(trace(&events), want, "{label}");
                    assert_eq!(h.dropped(), 0, "{label}");

                    // Not in the trace, but in the contract: on both sources each STEP
                    // leaves in the frame its grid step falls on. No drift, no latency.
                    // (A format 1 fixture plays from step 0, so every step has one; a
                    // format 2 fixture may be stopped for some of its steps.)
                    let got_frames: Vec<u64> =
                        events.iter().filter(|(_, e)| e.kind == EV_STEP).map(|(f, _)| *f).collect();
                    if fx.num("format") == 1 {
                        assert_eq!(got_frames, plan.step_frames, "{label}");
                    } else {
                        assert!(got_frames.iter().all(|f| plan.step_frames.contains(f)), "{label}");
                    }

                    writeln!(report, "# {label}").unwrap();
                    report.push_str(&text);
                    runs += 1;
                }

                // Save, load into a fresh engine with another seed, same trace (§8).
                let snap = snapshot_of(&fx, rate);
                let label = format!("{name} {source_name} {rate} from a snapshot");
                let plan = schedule(&fx, rate, source, true);
                let mut h = Host::new(rate, fx.num("seed") as u32 + 12_345);
                assert_eq!(h.load(&snap), OK);
                let (events, text) = play(&mut h, &plan, 128, &label);
                assert_eq!(trace(&events), want, "{label}");
                assert_eq!(h.dropped(), 0);
                writeln!(report, "# {name} {source_name} {rate} snapshot {}", hex(&snap)).unwrap();
                report.push_str(&text);
                runs += 1;

                // §20: and from the snapshot a beat entered by keys saves (Session 21).
                let snap = kept_snapshot_of(&fx, rate);
                let label = format!("{name} {source_name} {rate} from a kept snapshot");
                let mut h = Host::new(rate, fx.num("seed") as u32 + 12_345);
                assert_eq!(h.load(&snap), OK);
                let (events, text) = play(&mut h, &plan, 128, &label);
                assert_eq!(trace(&events), want, "{label}");
                writeln!(report, "# {name} {source_name} {rate} kept snapshot {}", hex(&snap)).unwrap();
                report.push_str(&text);
                runs += 1;
            }
        }
    }
    assert_eq!(runs, count * 2 * 3 * 5);
    // The Makefile compares this file with the ones the Node and C++ harnesses write.
    if let Ok(path) = std::env::var("PI_REPORT") {
        std::fs::write(path, report).unwrap();
    }
}

/// `fixtures/snapshots-v1.txt`, `-v2.txt` and `-v3.txt`: each fixture's snapshot, as the core
/// of the day wrote it before the next version existed (Sessions 11, 16 and 21).
fn old_snapshots(file: &str) -> Vec<(String, Vec<u8>)> {
    let path = format!("{}/../fixtures/{file}", env!("CARGO_MANIFEST_DIR"));
    std::fs::read_to_string(path)
        .unwrap()
        .lines()
        .filter(|l| !l.starts_with('#') && !l.is_empty())
        .map(|l| {
            let (name, hex) = l.split_once(' ').unwrap();
            let bytes: Vec<u8> = (0..hex.len()).step_by(2).map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap()).collect();
            (name.to_string(), bytes)
        })
        .collect()
}

/// Loads each old snapshot over an engine with every field a newer version adds moved from
/// its starting value, so a load that left one alone shows in the saved bytes; then holds it
/// to today's snapshot of the same fixture and to the fixture's trace on both sources.
fn old_snapshots_still_load(file: &str, version: u8, size: usize) {
    let all = fixtures();
    let old = old_snapshots(file);
    assert_eq!(old.len(), if version < 3 { 7 } else { 9 }, "one a fixture of its day");
    let mut d = Host::new(48_000, 3);
    let mut dress: Vec<Cmd> = (0..16u8).flat_map(|t| [cmd(CMD_SOUND, t, 0, 100 + t as u32), cmd(CMD_SOUND, t, 1, 9000), cmd(CMD_VOICE, t, 0, 1)]).collect();
    let (down, up) = (|k| cmd(CMD_KEY_DOWN, k, 0, 0), |k| cmd(CMD_KEY_UP, k, 0, 0));
    dress.extend([down(18), down(3), up(3), up(18)]); // bpm + key 4: volume 4
    dress.extend([down(16), down(9), up(9), up(16)]); // sound + key 10: key 10 chosen
    dress.extend((0..16u8).map(|s| cmd(CMD_FX, s, 0, 1 + s as u32))); // §17: a full lane
    dress.extend([cmd(CMD_FXSOUND, 0, 0, 0), cmd(CMD_FXSOUND, 15, 0, 0)]);
    // §20: every step of every sound keeps values, the step off or on.
    dress.extend((0..16u8).flat_map(|t| (0..16u8).map(move |s| cmd(CMD_KEEP, t, s, 0x1234_5678))));
    d.block(1, &dress);
    let dressed = d.save();
    assert_eq!((dressed[378], dressed[379]), (4, 9), "volume 4, key 10 chosen");
    assert_eq!((dressed[399], dressed[400], dressed[401]), (16, 0xfe, 0x7f), "a full lane, two sounds out");
    assert!(dressed[404..436].iter().all(|b| *b == 0xff), "every step keeps");

    for (name, bytes) in &old {
        assert_eq!(bytes.len(), size, "{name}");
        assert_eq!(bytes[4..6], [version, 0], "{name}: version {version}");
        let (_, fx) = all.iter().find(|(n, _)| n == name).unwrap_or_else(|| panic!("no fixture {name}"));
        let want = expect(fx);
        for (source_name, source) in SOURCES {
            for rate in RATES {
                let label = format!("{name} {source_name} {rate} from its version {version} snapshot");
                let mut h = Host::new(rate, fx.num("seed") as u32 + 777);
                assert_eq!(h.load(&dressed), OK);
                assert_eq!(h.load(bytes), OK, "{label}");
                let s = h.save();
                assert!(s[312..376].chunks(2).all(|v| v == [0x00, 0x80]), "{label}: sliders at their middles");
                assert_eq!(s[376..384], [0, 0, 16, 0, 0, 0, 0, 0], "{label}: all code, volume 16, key 1");
                if version < 3 {
                    assert_eq!(s[384..404], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 0, 0], "{label}: the lane empty, every sound in");
                }
                // What today's core saves for the same fixture is the old one, grown: up to
                // byte 404 the same bytes. The fixture's step-0 edits are `STEP`s, which keep
                // nothing (§20); the old load keeps, for every step that is on, its sound's own
                // A and B (D75 item 6), and nothing for the rest.
                let today = snapshot_of(fx, rate);
                assert_eq!(s[..404], today[..404], "{label}");
                assert!(today[404..SNAP - 4].iter().all(|b| *b == 0), "{label}: an edit keeps nothing");
                let mut kept = [0u8; SNAP - 4 - 404];
                for t in 0..16 {
                    kept[2 * t..2 * t + 2].copy_from_slice(&s[24 + 2 * t..26 + 2 * t]); // keep = on
                    let on = u16::from_le_bytes([s[24 + 2 * t], s[25 + 2 * t]]);
                    for st in 0..16 {
                        if on >> st & 1 == 1 {
                            let at = 32 + 4 * (16 * t + st);
                            kept[at..at + 4].copy_from_slice(&s[312 + 4 * t..316 + 4 * t]);
                        }
                    }
                }
                assert_eq!(s[404..SNAP - 4], kept[..], "{label}: each step that is on keeps its sound's own");
                let plan = schedule(fx, rate, source, true);
                let (events, _) = play(&mut h, &plan, 128, &label);
                assert_eq!(trace(&events), want, "{label}");
            }
        }
    }
}

#[test]
fn every_version_1_snapshot_ever_written_still_loads_and_gives_its_fixture_s_trace() {
    old_snapshots_still_load("snapshots-v1.txt", 1, SNAP_V1);
}

#[test]
fn every_version_2_snapshot_ever_written_still_loads_and_gives_its_fixture_s_trace() {
    old_snapshots_still_load("snapshots-v2.txt", 2, SNAP_V2);
}

#[test]
fn every_version_3_snapshot_ever_written_still_loads_and_gives_its_fixture_s_trace() {
    old_snapshots_still_load("snapshots-v3.txt", 3, SNAP_V3);
}
