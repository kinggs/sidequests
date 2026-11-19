//! P2, natively: every fixture, on both clock sources, at three sample rates and three block
//! sizes, compared byte for byte. `fixtures/README.md` says how a harness runs one; the Node
//! and C++ harnesses in `harness/` do the same and write the same report.

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
    assert!(names.len() >= 4, "expected the four fixtures, found {names:?}");
    names
        .into_iter()
        .map(|n| {
            let j = parse(&std::fs::read_to_string(format!("{dir}/{n}")).unwrap());
            assert_eq!(j.num("format"), 1, "{n}");
            assert_eq!(j.num("ticks_per_step"), 96, "{n}");
            (n.trim_end_matches(".json").to_string(), j)
        })
        .collect()
}

fn is_edit(name: &str) -> bool {
    matches!(name, "step" | "prob" | "swing" | "length")
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
        other => panic!("unknown fixture command {other}"),
    }
}

/// What to send and when. Returns the commands at absolute frames, the frame each run step
/// falls on, and the frame the run ends before.
fn schedule(fx: &Json, rate: u32, source: u32, from_snapshot: bool) -> (Vec<(u64, Cmd)>, Vec<u64>, u64) {
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
        for c in fx.arr("commands").iter().filter(|c| c.num("at") == m) {
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
    }
    (cmds, step_frames, anchor + f(steps - anchor_step))
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
                    let (cmds, step_frames, end) = schedule(&fx, rate, source, false);
                    let mut h = Host::new(rate, fx.num("seed") as u32);
                    let events = h.run(end, block, &cmds);
                    let got = trace(&events);
                    assert_eq!(got, want, "{name} {source_name} {rate} {block}");
                    assert_eq!(h.dropped(), 0, "{name} {source_name} {rate} {block}");

                    // Not in the trace, but in the contract: on both sources each STEP
                    // leaves in the frame its grid step falls on. No drift, no latency.
                    let got_frames: Vec<u64> =
                        events.iter().filter(|(_, e)| e.kind == EV_STEP).map(|(f, _)| *f).collect();
                    assert_eq!(got_frames, step_frames, "{name} {source_name} {rate} {block}");

                    writeln!(report, "# {name} {source_name} {rate} {block}").unwrap();
                    report.push_str(&got);
                    runs += 1;
                }

                // Save, load into a fresh engine with another seed, same trace (§8).
                let snap = snapshot_of(&fx, rate);
                let (cmds, _, end) = schedule(&fx, rate, source, true);
                let mut h = Host::new(rate, fx.num("seed") as u32 + 12_345);
                assert_eq!(h.load(&snap), OK);
                let got = trace(&h.run(end, 128, &cmds));
                assert_eq!(got, want, "{name} {source_name} {rate} from a snapshot");
                assert_eq!(h.dropped(), 0);
                writeln!(report, "# {name} {source_name} {rate} snapshot {}", hex(&snap)).unwrap();
                report.push_str(&got);
                runs += 1;
            }
        }
    }
    assert_eq!(runs, 4 * 2 * 3 * 4);
    // The Makefile compares this file with the ones the Node and C++ harnesses write.
    if let Ok(path) = std::env::var("PI_REPORT") {
        std::fs::write(path, report).unwrap();
    }
}
