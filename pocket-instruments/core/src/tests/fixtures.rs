//! P2, natively: every fixture, on both clock sources, at three sample rates and three block
//! sizes, compared byte for byte. `fixtures/README.md` says how a harness runs one; the Node
//! and C++ harnesses in `harness/` do the same and write the same report.
//! Format 2 adds keys, sliders and views (Session 10).

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
    assert!(names.len() >= 7, "expected the seven fixtures, found {names:?}");
    names
        .into_iter()
        .map(|n| {
            let j = parse(&std::fs::read_to_string(format!("{dir}/{n}")).unwrap());
            assert!(matches!(j.num("format"), 1 | 2), "{n}");
            assert!(j.num("format") == 2 || j.get("views").is_none(), "{n}: views are format 2's");
            assert_eq!(j.num("ticks_per_step"), 96, "{n}");
            (n.trim_end_matches(".json").to_string(), j)
        })
        .collect()
}

fn is_edit(name: &str) -> bool {
    matches!(name, "step" | "prob" | "swing" | "length")
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
    Plan { cmds, step_frames, end, views }
}

/// Runs a plan in blocks of `block`, ending a block wherever a view is to be read. Returns
/// the events and the report's text: the trace, then the views.
fn play(h: &mut Host, plan: &Plan, block: u32, label: &str) -> (Vec<(u64, Event)>, String) {
    let mut events = Vec::new();
    let mut views = String::new();
    for (frame, want) in &plan.views {
        events.extend(h.run(frame - h.now, block, &plan.cmds));
        let got = view_text(&h.view());
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
fn snapshot_of(fx: &Json, rate: u32) -> [u8; 316] {
    let mut a = Host::new(rate, fx.num("seed") as u32);
    let mut cmds = vec![cmd(CMD_TEMPO, 0, 0, fx.num("mbpm") as u32)];
    cmds.extend(
        fx.arr("commands").iter().filter(|c| c.num("at") == 0 && is_edit(c.str("cmd"))).map(to_cmd),
    );
    a.block(1, &cmds);
    a.save()
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

#[test]
fn every_fixture_everywhere() {
    let mut report = String::new();
    let mut runs = 0;
    for (name, fx) in fixtures() {
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
            }
        }
    }
    assert_eq!(runs, 7 * 2 * 3 * 4);
    // The Makefile compares this file with the ones the Node and C++ harnesses write.
    if let Ok(path) = std::env::var("PI_REPORT") {
        std::fs::write(path, report).unwrap();
    }
}
