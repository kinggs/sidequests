# The gate: the node tests, then every app opened in a headless browser (shared/smoke.mjs).
# Smoke exits 2 when there is no Playwright; that is reported as a skip, not a failure.
.PHONY: verify
verify:
	node --test
	@node shared/smoke.mjs; s=$$?; [ $$s -eq 2 ] && echo "Smoke test skipped: no Playwright." && exit 0; exit $$s
