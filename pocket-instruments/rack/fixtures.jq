# One fixture (format 1) as a C++ initialiser for Probe.cpp's Fixture.
def kind: {"play":5,"reset":2,"step":16,"prob":17,"swing":18,"length":19}[.cmd]
  // error("a fixture command the Rack probe does not know: \(.cmd)");
if .format != 1 or .ticks_per_step != 96 then error("not fixture format 1") else
"{\"\(.name)\", \(.seed), \(.mbpm), \(.steps),\n {"
+ ([.commands[] | "{\(.at),\(kind),\(.track // 0),\(.step // 0),\(.value // 0)}"] | join(","))
+ "},\n {"
+ ([.expect[] | split(" ") | if .[1] == "step" then "{0,\(.[0]),1,0,\(.[2]),0}"
     elif .[1] == "trig" then "{0,\(.[0]),2,\(.[2]),\(.[3]),0}" else error("a trace line that is not step or trig") end] | join(","))
+ "}},"
end
