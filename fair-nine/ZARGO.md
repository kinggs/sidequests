# Zargo — one rating across cue games

**Status:** the definition and the League update are built (Rack It 1.0.0); the other games
and the handicap levers are not. This is the plan for taking Zargo from "point share in the
household's 11-point nine-ball" to one rating that every cue game in Fair Nine feeds, in the
way FargoRate pools 8-ball, 9-ball and 10-ball into one number. Open questions are marked ⚠.

## What we borrow from Fargo

| Fargo idea | Zargo today | Zargo planned |
|---|---|---|
| One rating per player across all pool games | one game only | every game in Fair Nine feeds it |
| 100 points apart = the stronger player wins twice as many games | 100 apart = twice the **points** | 100 apart = twice the **racks** |
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
| League (11-point) | A's share of the live points in the rack | 1.0, spread by live points (below) | a whole rack of point share is worth more than one win/loss |
| Golden Nine | 1 if A won the rack, else 0 | 0.5 | one rack decides one thing |
| Standard nine-ball | 1 or 0 | 0.5 | same |
| WPA 8-ball, Heyball (later) | 1 or 0 | 0.5 | same shape as standard |

After a session:

```
delta = K × Σ w_i × (r_i − pA)          // over every complete rack i, K = 8
delta = clamp(delta, −40, +40)
Za += delta;  Zb −= delta
robustness += Σ w_i                     // a standard rack counts half a league rack
```

This is the spec §3.3 formula rewritten per rack. League spreads its `w` over a match's racks by
the live points each carried (`w_i = w × live_i / mean`), so the weights still sum to `w × racks`
and a league-only match produces exactly the number §3.3 does (SPEC §12.9). History and ratings
stay continuous. The settling rules in §11 stay, with "observed point share" replaced by
"observed mean `r`".

Handicap never enters the update. Whether a session was played with a spot or level, the racks
are what happened, and that is what the rating learns from.

## Handicap levers

Chosen at session setup, per session: **off**, **scoring**, or **racks** (the "already won
racks" head start). Not every game supports every lever.

| Lever | League | Golden Nine | Standard / 8-ball / Heyball |
|---|---|---|---|
| Scoring: point quotas and the lead bar (spec §3.2) | yes, as today | yes: quota = expected share of the session's points | no points to share |
| Racks: race to `nA` vs `nB`, or a head start in a race to `n` | in a rack-count race | yes | yes, the normal Fargo chart |

The race chart is exact, not a rule of thumb: pick the pair of targets whose race-win
probability is closest to even, computed with a small dynamic programme over `pA`. A head
start is the same chart shown differently: both race to `n`, the underdog begins at
`n − nUnderdog`. Setup shows both readings and keeps the numbers editable.

Golden Nine's point quota assumes point share ≈ rack-win share, which is close enough because
almost every point in a rack goes to the winner (fouls cap at 2 for the loser).

## Challenges, and what we do about each

1. **Point share is not rack-win probability.** A player who scores twice their opponent's
   points in the league game wins more than two racks in three. Treating point share as `r`
   therefore understates gaps compared with Fargo. We accept this for now. We hold every
   league rack's ball states, so once a few standard and golden sessions exist we can measure
   the real relation in this household and fit a mapping. ⚠ Revisit after 100 non-league racks.
2. **Standard racks carry little information.** At `w = 0.5` a player needs 60 standard racks to
   leave provisional. That is honest. Fargo's own threshold is 200 games.
3. **Players really do differ by game.** Fargo ignores this, and so do we: one number. Per-game
   win records are shown for interest, never used for handicaps.
4. **Winner breaks makes racks correlated.** Golden Nine plays winner-breaks, so a run of racks
   is not independent trials. Ignored, as Fargo ignores it. The ±40 clamp limits the damage.
5. **Migration.** Every stored session gains `game: "league"` when missing. `robustness` keeps
   its value and its meaning. No rating changes on the day the switch lands.
6. **Fouls in standard nine-ball are recorded, never rated.** They exist so every game's screen
   looks the same and so a Cuescore entry or a later stat can use them.
7. **Three-foul racks in Golden Nine** are a rack win for the non-fouling player and count as
   `r = 1` like any other win. Their points are set by the rules (see spec §12).
8. **Weights are guesses.** `w` per game and `K` live in config, like the point values do, so
   tuning is one edit and needs no migration.
9. **Growing past the household.** If members of Sessions Billiard Club join, the shared people
   list becomes the club list and everyone on the allowlist sees everyone's ratings. That is
   how Fargo works too. Decided: one flat list for now, grouping by club is a later option.
10. **Cuescore has its own Elo.** Different scale, different inputs, never merged. The one link
    we want is a **starter hint**: Cuescore's read-only API gives a player's rating, and a new
    player's Zargo can be seeded from where they sit among people we already rate.

## Open questions

- ⚠ Whether to show a per-game rating for interest once data exists, or keep one number only.
- ⚠ The league-to-rack mapping in challenge 1, once there is data to fit it.
