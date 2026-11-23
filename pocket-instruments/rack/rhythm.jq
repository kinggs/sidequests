# One format 2 fixture (keys, sliders and views; fixtures/README.md) as a C++ initialiser for
# Rhythm.cpp's self-test. A format 1 fixture is left out: the Probe plays those. The Makefile runs
# this one file at a time, as it does fixtures.jq, so a refused fixture stops the build.
def kind: {"play":5,"reset":2,"step":16,"prob":17,"swing":18,"length":19,"key_down":32,"key_up":33,"param":34}[.cmd]
  // error("a fixture command the Rhythm self-test does not know: \(.cmd)");
if .format == 1 then empty elif .format != 2 or .ticks_per_step != 96 then error("not fixture format 2") else
"{\"\(.name)\", \(.seed), \(.mbpm), \(.steps),\n {"
+ ([.commands[] | "{\(.at),\(kind),\(.track // .key // .slider // 0),\(.step // 0),\(.value // 0)}"] | join(","))
+ "},\n {"
+ ([.expect[] | split(" ") | if .[1] == "step" then "{0,\(.[0]),1,0,\(.[2]),0}"
     elif .[1] == "trig" then "{0,\(.[0]),2,\(.[2]),\(.[3]),0}" else error("a trace line that is not step or trig") end] | join(","))
+ "},\n {"
+ ([.views[] | "{\(.at),\(.view | @json)}"] | join(","))
+ "}},"
end
