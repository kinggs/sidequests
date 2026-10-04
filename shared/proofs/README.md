# shared/proofs — the browser proofs and the rules guard check

None of these run under a bare `node --test`; `make verify` runs `shared/smoke.mjs`, which
shares `pw.mjs` with them.

| File | What it does | Needs |
| --- | --- | --- |
| `pw.mjs` | Finds Playwright and Chromium, serves the repo | Playwright (`PLAYWRIGHT=<path to playwright-core/index.mjs>` for a copy elsewhere) |
| `h.mjs` | Helpers for multi-tab `?mock` proofs: a tab per user (`&as=`, `&role=`, a seed), `C`/`tryC` to call `cloud` in a tab, the fake store, Rack It's scoring | Playwright |
| `rack-it-outsiders.mjs` | Session 6: Ann, Ben and Cat outside the household | Playwright |
| `rack-it-one-admin.mjs` | Session 6b: the owner, Melanie as a member, Ann; with `OLD=<git rev>` and `SEED=<export>`, old build against new | Playwright |
| `rack-it-same-match.mjs` | The ground rule: one 11-Point-Nine match on `OLD=<git rev>` and on this build saves the same documents | Playwright |
| `claim-guest.mjs` | Session 8 step 1: That was them, in Rack It, Zombie Dice and Around the Clock | Playwright |
| `rack-it-seats.mjs` | Session 8 step 2: Who's playing chips, the Game QR, a guest's seat taken, the Home card | Playwright |
| `rack-it-two-phones.mjs` | Session 8 step 3: two phones score one match; a tab offline for five changes; a race; Undo on the echo strip | Playwright |
| `rack-it-scorer.mjs` | Session 8 step 4: Mel scores a rated match for the owner and Ann; both sign; Rebuild agrees | Playwright |
| `connect-scan.mjs` | Session 10 step 2: My QR's Or scan theirs, from Rack It's Show QR and `people.pick`; your own QR and a dead code; Sessions Loyalty's scanner on `connect.scan` | Playwright |
| `club-friends.mjs` | Session 10 step 3: club connections fold under Sessions in Friends and the picker; the staff tag stamped once a day, and taken off | Playwright |
| `table-session.mjs` | Session 10 step 4: staff start a club match from the loyalty app, score it in Rack It; a spend beside it; both confirm; one earn entry each; Rebuilds change nothing | Playwright |
| `rack-it-expiry.mjs` | Session 10 step 5: a pending rated match expires after a week, on a player's phone or the scorer's; the strips count down | Playwright |
| `rev-probe.mjs` | Session 8 step 3's probe: queued offline writes against a counter and against the chain, on the emulator | Java 21, npx |
| `zombie-dice-open.mjs` | Session 7 step 4: the open rule in Zombie Dice, on a seed of old games (`seeds/`); with `OLD=<git rev>`, old build against new | Playwright |
| `bloc-11-open.mjs` | Session 9 step 1: Bloc 11 on the open rule, on a seed of old climbs (as the backfill left them, since Session 10); a guest's climb; That was them; with `OLD=<git rev>`, old build against new | Playwright |
| `photo-coach-open.mjs` | Session 9 step 2: Photo Coach on the open rule, on a seed of the owner's old log; a stranger's empty log; the stored size of a full photo | Playwright |
| `zombie-dice-phones.mjs` | Session 9 step 3: one phone as before; three tabs play a whole game, the starter playing for a guest; a Game QR seat | Playwright |
| `rules.mjs` | `shared/rules-check.mjs` against the rules on a local emulator | Java 21, npx |
| `mutate.mjs`, `guards.mjs` | Loosens each guard in turn; its own case must go red | Java 21, npx |

A seed is an app export. Never commit the owner's: the repo is public. Screenshots from a
failing proof go to `SHOTS` (default: `sidequests-shots` in the system temp folder).
