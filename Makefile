# The gate: the node tests, then every app opened in a headless browser (shared/smoke.mjs).
# Smoke exits 2 when there is no Playwright; that is reported as a skip, not a failure.
# Pocket Editor's engine is Python, run by uv (which fetches Pillow and numpy itself); no uv, no run.
# Pocket Instruments' engine is Rust: no cargo, no run. With cargo it builds both targets and runs
# its fixtures three ways (pocket-instruments/Makefile). `node --test` above meets its Node test
# too, which skips when the .wasm has not been built yet.
# SKIP=pocket-instruments (or pocket-editor, or both) leaves that part out, said aloud: for when
# another session is building in that folder and a build here would write into its work.
SKIP ?=
.PHONY: verify
verify:
	node --test
	@if [ -n "$(filter pocket-editor,$(SKIP))" ]; then echo "Pocket Editor tests skipped: SKIP."; elif command -v uv >/dev/null; then uv run -q pocket-editor/test_engine.py; else echo "Pocket Editor tests skipped: no uv."; fi
	@if [ -n "$(filter pocket-instruments,$(SKIP))" ]; then echo "Pocket Instruments tests skipped: SKIP."; elif command -v cargo >/dev/null; then $(MAKE) --no-print-directory -C pocket-instruments test; else echo "Pocket Instruments tests skipped: no cargo."; fi
	@node shared/smoke.mjs; s=$$?; [ $$s -eq 2 ] && echo "Smoke test skipped: no Playwright." && exit 0; exit $$s
