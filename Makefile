# The gate: the node tests, then every app opened in a headless browser (shared/smoke.mjs).
# Smoke exits 2 when there is no Playwright; that is reported as a skip, not a failure.
# Pocket Editor's engine is Python, run by uv (which fetches Pillow and numpy itself); no uv, no run.
# Pocket Instruments' engine is Rust: no cargo, no run. With cargo it builds both targets and runs
# its fixtures three ways (pocket-instruments/Makefile). `node --test` above meets its Node test
# too, which skips when the .wasm has not been built yet.
# SKIP=pocket-instruments (or pocket-editor, or both) leaves that part out, said aloud: for when
# another session is building in that folder and a build here would write into its work.
# Last, every shared/proofs/rack-it-*.mjs, one line of verdict each; exit 2 (no Playwright) is a
# skip. rack-it-same-match compares against OLD, by default origin/main: the build that is live.
# Only it gets OLD: rack-it-one-admin's old-build mode checks household-era reads the open rule
# retired, and fails 4 checks against any build since.
# SKIP=rack-it-proofs leaves them out.
SKIP ?=
OLD ?= origin/main
.PHONY: verify
verify:
	node --test
	@if [ -n "$(filter pocket-editor,$(SKIP))" ]; then echo "Pocket Editor tests skipped: SKIP."; elif command -v uv >/dev/null; then uv run -q pocket-editor/test_engine.py; else echo "Pocket Editor tests skipped: no uv."; fi
	@if [ -n "$(filter pocket-instruments,$(SKIP))" ]; then echo "Pocket Instruments tests skipped: SKIP."; elif command -v cargo >/dev/null; then $(MAKE) --no-print-directory -C pocket-instruments test; else echo "Pocket Instruments tests skipped: no cargo."; fi
	@node shared/smoke.mjs; s=$$?; [ $$s -eq 2 ] && echo "Smoke test skipped: no Playwright." && exit 0; exit $$s
	@if [ -n "$(filter rack-it-proofs,$(SKIP))" ]; then echo "Rack It proofs skipped: SKIP."; exit 0; fi; \
	fail=0; for p in shared/proofs/rack-it-*.mjs; do \
	  n=$$(basename $$p .mjs); \
	  if [ $$n = rack-it-same-match ]; then out=$$(OLD=$(OLD) node $$p 2>&1); else out=$$(OLD= node $$p 2>&1); fi; s=$$?; \
	  if [ $$s -eq 2 ]; then echo "$$n skipped: $$(echo "$$out" | tail -1)"; \
	  elif [ $$s -eq 0 ]; then echo "$$n: $$(echo "$$out" | tail -1)"; \
	  else echo "$$out" | tail -30; echo "$$n FAILED (exit $$s)"; fail=1; fi; \
	done; exit $$fail
