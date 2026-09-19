# Zargo — one rating across cue games

**Status:** built. The definition and the per-rack update (Rack It 1.0.0), Golden-Nine and
Trad-Nine (1.1.0), the handicap levers (1.3.0), replayable ratings (2.0.0), and the two 8-ball
games (2.2.0), which is the point at which one rating really does span two disciplines. The code is
[`zargo.js`](zargo.js), a pure module proven by `zargo.test.mjs`. This doc took Zargo from
"point share in the household's 11-point nine-ball" to one rating that every cue game in Rack
It feeds, in the way FargoRate pools 8-ball, 9-ball and 10-ball into one number. Open questions
are marked ⚠.

## What we borrow from Fargo

| Fargo idea | Zargo today | Zargo planned |
|---|---|---|
| One rating per player across all pool games | every game in Rack It feeds it, 8-ball and 9-ball alike (2.2.0) | — |
| 100 points apart = the stronger player wins twice as many games | 100 apart = twice the **racks**, and twice the points in 11-Point-Nine | — |
| Robustness = games counted; provisional until enough | racks counted, provisional under 30 | weighted racks, provisional under 30 |
| Newcomers move more than established players | settling logic (spec §11) | same, made game-aware |
| Handicap by race chart (race to 7 vs race to 4) | point targets only | race chart **and** point quotas, per game |
| Starter rating from a known player | yes | yes, plus Cuescore rating as a hint |

Nothing about the scale changes for a player: 500 is still average, and no stored rating moves
at the switch.

## The definition

Zargo is odds on a **rack**. For players A and B:

```
pA = 1 / (1 + 2 ^ ((Zb − Za) / 100))     // chance A wins any one rack
```

Every game turns each rack into a result `r` for A between 0 and 1, and a weight `w` that says
how much one rack of that game tells us:

| Game | `r` for one rack | `w` | Why |
|---|---|---|---|
| 11-Point-Nine | A's share of the live points in the rack | 1.0, spread by live points (below) | a whole rack of point share is worth more than one win/loss |
| Golden-Nine | 1 if A won the rack, else 0 | 0.5 | one rack decides one thing |
| Trad-Nine | 1 or 0 | 0.5 | same |
| Trad-Eight | 1 or 0 | 0.5 | same shape as Trad-Nine |
| Ten-Point-Eight | 1 or 0 | 0.5 | its points never enter the rating (challenge 11) |
| Heyball (later) | 1 or 0 | 0.5 | same again |

**Why 8-ball and 9-ball share one number.** FargoRate pools 8-ball, 9-ball, 10-ball and one
pocket into a single rating, takes only the rack winner from any of them, and finds that an
8-ball-only fit and a 9-ball-only fit of the same player land within a couple of points of the
pooled one ([Mixing games: Corey Deuel and
8-ball](https://www.fargorate.com/fargorateblog/archive/mixing-games-in-fargorate-a-look-at-corey-deuel-and-8-ball/)).
A player's record naturally reflects the game they play most, which the system takes as their
true skill. A heavier `w` for 8-ball, on the grounds that a rack is longer and less lucky than a
nine-ball rack, was considered and not taken for the same reason; it is config either way. What
Zargo does *not* borrow is Fargo's daily re-fit of everyone and its linear starter blend — the
calibration and settling regimes below do that job at household size, and every stored rating
stays put.

After a session:

```
delta = K × Σ w_i × (r_i − pA)          // over every complete rack i, K = 8
delta = clamp(delta, −40, +40)
Za += delta;  Zb −= delta
robustness += Σ w_i                     // a Trad-Nine rack counts half an 11-Point-Nine rack
```

This is the spec §3.3 formula rewritten per rack. 11-Point-Nine spreads its `w` over a match's racks by
the live points each carried (`w_i = w × live_i / mean`), so the weights still sum to `w × racks`
and an 11-Point-Nine-only match produces exactly the number §3.3 does (SPEC §12.9). History and ratings
stay continuous. The settling rules in §11 stay, with "observed point share" replaced by
"observed mean `r`".

Handicap never enters the update. Whether a session was played with a spot or level, the racks
are what happened, and that is what the rating learns from.

## Handicap levers

Chosen at session setup, per session: **off**, **scoring**, or **racks** (the "already won
racks" head start). Not every game supports every lever.

| Lever | 11-Point-Nine | Golden-Nine | Ten-Point-Eight | Trad-Nine / Trad-Eight / Heyball |
|---|---|---|---|---|
| Scoring: point quotas and the lead bar (spec §4) | yes | yes: quota = expected share of the match's points | yes, but a **spot**: expected points a rack × racks, and whoever finishes further past their own quota wins | no points to share |
| Racks: race to `nA` vs `nB`, or a head start in a race to `n` | in a rack-count race | yes | yes | yes, the normal Fargo chart |

Ten-Point-Eight can't share a fixed pot of points the way Golden-Nine does, because the loser of
a rack keeps their own balls and so has a floor. Expected points a rack are linear in `pA`
instead — `eA = 10 × pA + L̄ × (1 − pA)`, `L̄` the mean loser's balls (config `meanLoserBalls`,
3.5 ⚠ a guess until 50 racks are stored) — and the quotas are those times the racks (spec §4).

The race chart is exact, not a rule of thumb: pick the pair of targets whose race-win
probability is closest to even, computed with a small dynamic programme over `pA`. A head
start is the same chart shown differently: both race to `n`, the underdog begins at
`n − nUnderdog`. Setup shows both readings and keeps the numbers editable.

As built: the favourite races to the chosen length `n` and the underdog's target is searched
from 1 to `n`. With a 90-point gap (`pA` ≈ 0.65) a race to 7 becomes 7 against 4, which the
favourite wins 51% of the time; a race to 5 becomes 5 against 3 (53%).

Golden-Nine's point quota assumes point share ≈ rack-win share, which is close enough because
almost every point in a rack goes to the winner (fouls cap at 2 for the loser).

## Challenges, and what we do about each

1. **Point share is not rack-win probability.** A player who scores twice their opponent's
   points in the 11-Point-Nine game wins more than two racks in three. Treating point share as `r`
   therefore understates gaps compared with Fargo. We accept this for now. We hold every
   11-Point-Nine rack's ball states, so once a few Trad-Nine and Golden-Nine matches exist we can measure
   the real relation in this household and fit a mapping. ⚠ Revisit after 100 Golden-Nine and Trad-Nine racks.
2. **Trad-Nine racks carry little information.** At `w = 0.5` a player needs 60 Trad-Nine racks to
   leave provisional. That is honest. Fargo's own threshold is 200 games.
3. **Players really do differ by game.** Fargo ignores this, and so do we: one number. Per-game
   win records are shown for interest, never used for handicaps.
4. **Winner breaks makes racks correlated.** Golden-Nine plays winner-breaks, so a run of racks
   is not independent trials. Ignored, as Fargo ignores it. The ±40 clamp limits the damage.
5. **Migration.** Every stored session gains `game: "league"` when missing. `robustness` keeps
   its value and its meaning. No rating changes on the day the switch lands.
6. **Fouls in Trad-Nine are recorded, never rated.** They exist so every game's screen
   looks the same and so a Cuescore entry or a later stat can use them.
7. **Three-foul racks in Golden-Nine** are a rack win for the non-fouling player and count as
   `r = 1` like any other win. Their points are set by the rules (see spec §12).
8. **Weights are guesses.** `w` per game and `K` live in config, like the point values do, so
   tuning is one edit and needs no migration.
9. **Growing past the household.** If members of Sessions Billiard Club join, the shared people
   list becomes the club list and everyone on the allowlist sees everyone's ratings. That is
   how Fargo works too. Decided: one flat list for now, grouping by club is a later option.
10. **Cuescore has its own Elo.** Different scale, different inputs, never merged. The one link
    we want is a **starter hint**: Cuescore's read-only API gives a player's rating, and a new
    player's Zargo can be seeded from where they sit among people we already rate.
11. **Ten-Point-Eight's loser's balls might be evidence.** Every rack stores how many of the
    loser's own group were down, and the rating ignores it — Fargo's way, and challenge 1's
    reason: the winner always has 10, so a point share would only grade how badly the loser lost.
    ⚠ Untested. Once a hundred 8-ball racks exist, check whether the count predicts anything the
    rack winner doesn't.

## Open questions

- ⚠ Whether to show a per-game rating for interest once data exists, or keep one number only.
  Fargo's own answer is one number; per-discipline win records are shown for interest.
- ⚠ The 11-Point-Nine-to-rack mapping in challenge 1, once there is data to fit it.
