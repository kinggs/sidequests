# Sidequests

Small, phone-first apps for the things Kenny and friends actually do. Keep score at the pool table, log a climb before the next attempt, or pass one phone around for a game of Zombie Dice.

**[Browse the apps](https://kinggs.github.io/sidequests/)** · **[Try Rack It with practice data](https://kinggs.github.io/sidequests/rack-it/?mock)**

## Pick a sidequest

| At the… | Open | What it does |
| --- | --- | --- |
| Pool table | [Rack It](rack-it/SPEC.md) | Score a match, track ratings and run a tournament. |
| Dartboard | [Around the Clock](around-the-clock/SPEC.md) | Play a practice drill and measure progress out of 180. |
| Climbing wall | [Bloc 11](bloc-11/SPEC.md) | Log boulders and the grades climbed. |
| Games table | [Zombie Dice](zombie-dice/SPEC.md) | Pass the phone or connect players on separate phones. |

The launcher also includes Photo Coach, Sessions Loyalty and a members-only family tree. Pocket Editor runs on the desktop to cull, crop and colour-correct an album. [Pocket Editor spec](pocket-editor/SPEC.md)

Sometimes a sidequest grows up. Pocket Instruments started here and now has its own repository, where one Rust engine powers a drum machine in a browser and in VCV Rack. [Play Rhythm](https://kinggs.github.io/pocket-instruments/web/rhythm.html) · [Source](https://github.com/kinggs/pocket-instruments)

## Run one locally

From the repository root, run:

```sh
python3 -m http.server 8000
```

Open [Rack It locally in mock mode](http://localhost:8000/rack-it/?mock). The app uses a simulated account and stores practice data in that browser. Open [a second player](http://localhost:8000/rack-it/?mock&as=ann) in another tab to try both sides of a game. The web apps are static files, so edits are ready on refresh.

## Work on an app

Start with its `SPEC.md`. Most of the app lives in its `index.html`; the [shared kit](shared/KIT.md) handles accounts, players and connecting phones. The [design guide](shared/DESIGN.md) explains choices like large tap targets and high contrast. Humans and coding agents work from the same [repository instructions](AGENTS.md). Run `make verify` before shipping and check the output for any skipped browser tests.

Found something awkward on a real phone? [Open an issue](https://github.com/kinggs/sidequests/issues) with the app name, what you tapped and what happened.

## Licence

Original Sidequests software is available under the [MIT License](LICENSE). Third-party code and fonts retain their respective licences.
