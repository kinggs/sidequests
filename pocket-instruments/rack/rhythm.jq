# One format 2, 3 or 4 fixture (keys, sliders and views; fixtures/README.md) as a C++ initialiser
# for Rhythm.cpp's self-test. A format 1 fixture is left out: the Probe plays those. The Makefile
# runs this one file at a time, as it does fixtures.jq, so a refused fixture stops the build. The
# format 3 fixtures (the effects, Session 16) are in since Session 18: the module has FX GATES,
# and its self-test holds them to each view's fx. A format 4 fixture (§20, Session 21) adds
# the second mark.
def kind: {"play":5,"reset":2,"step":16,"prob":17,"swing":18,"length":19,"fx":23,"fxsound":24,"keep":26,"key_down":32,"key_up":33,"param":34}[.cmd]
  // error("a fixture command the Rhythm self-test does not know: \(.cmd)");
def value: if .cmd == "keep" then (.a * 65536 + .b) else (.value // 0) end;
# `fx` names its step where the others name a track: the command's `a` either way.
def first: if .cmd == "fx" then .step else (.track // .key // .slider // 0) end;
def second: if .cmd == "fx" then 0 else (.step // 0) end;
if .format == 1 then empty elif (.format != 2 and .format != 3 and .format != 4) or .ticks_per_step != 96 then error("not fixture format 2, 3 or 4") else
"{\"\(.name)\", \(.format), \(.seed), \(.mbpm), \(.steps),\n {"
+ ([.commands[] | "{\(.at),\(kind),\(first),\(second),\(value)}"] | join(","))
+ "},\n {"
+ ([.expect[] | split(" ") | if .[1] == "step" then "{0,\(.[0]),1,0,\(.[2]),0}"
     elif .[1] == "trig" then "{0,\(.[0]),2,\(.[2]),\(.[3]),0}" else error("a trace line that is not step or trig") end] | join(","))
+ "},\n {"
+ ([.views[] | "{\(.at),\(.view | @json)}"] | join(","))
+ "}},"
end
