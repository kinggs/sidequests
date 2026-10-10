# Inggs Family Tree — working doc for the build sessions

Recover Jon Inggs's family tree from the Wayback Machine, turn it into portable data, and give the
family a private place to browse it and grow it. This doc is the handover between consecutive
Claude Code sessions, the `rack-it/V3-PLAN.md` pattern: each session does its list, ticks its
boxes, and writes its Handover note at the bottom, so the next session starts from the truth.

**Start every session with:** "Read `family-tree/PLAN.md` and do Session N."
Session 1 (planning, Fable) is done. Sessions 2 to 4 run on Opus 5.5 and are specified below in
full; don't re-plan them, do them.

## Read first, every session

1. `CLAUDE.md` — the repo rules. Direct to `main`, one file per app, bump `APP_VERSION` and
   `CACHE` together, deploy with `/deployquest`, test with `?mock`.
2. `family-tree/SPEC.md` — the app as it will be: screens, data, rules, invites, privacy, and the
   owner's decisions. Update it in the same commit when a decision here changes it.
3. `family-tree/BRIEF.md` — the owner's brief, for the why. The spec and this doc override it
   where they differ (the Decisions table in the spec says where).
4. `shared/KIT.md` (Connect, accounts, the owner), `shared/CONNECT.md` §1–§2 and §8 (My QR,
   `handleInvite`), `shared/DESIGN.md` (before touching a screen).
5. The **Handover** section at the bottom of this doc.
6. Before a rules change: the Sessions Loyalty block in `shared/firestore.rules` and its cases in
   `shared/rules-check.mjs` (from "Sessions Loyalty: staff"), and `shared/proofs/README.md`.

## Ground rules for every session

- **No family data in this repo, ever.** Not a name, date, photo, GEDCOM, export or screenshot
  with real people. `family-tree/data/` is gitignored and is a clone of the private data repo
  (`kinggs/family-tree-data`); the tools write only there. Findings recorded in this doc are
  counts and patterns with placeholder names (`<given> <surname>`). The `?mock` seed is invented.
- **The raw mirror is immutable.** `data/mirror/` is written once by `tools/mirror.mjs` and never
  overwritten; every later step reads from it.
- **Be kind to archive.org.** About one request a second, retries with exponential backoff on
  429 and 5xx, a user agent that says who we are. Everything is read-only and within their terms.
- **Jon's wording is kept verbatim** in notes and captions; nothing missing is guessed; the
  unresolved is logged, never dropped (BRIEF.md, parsing rules).
- **Tools have tests.** A pure module in `tools/` gets a `*.test.mjs` beside it with synthetic
  fixtures; `node --test` from the repo root runs them (`make verify`).
- **Every rules change: cases first** in `shared/rules-check.mjs`, then the rule, then its guard
  in `shared/proofs/guards.mjs`, then `shared/cloud-memory.js`'s matching row. The `deploy-rules`
  Action runs the cases; a cloud session usually has no Java, so the Action is the check.
- **Deploy at the end of the session** (Sessions 3 and 4), not the start of the next. A session
  that can't finish its list deploys what works and writes the rest into Handover. The data repo
  is committed and pushed at the end of every session too; a cloud container is wiped afterwards.
- **Don't build ahead.** Each session's list is the whole of that session. Ideas go in Parked.
- Ask the owner nothing the spec, the brief or this doc already answers. If something is
  genuinely open, pick the simplest reading, do it, and say so in Handover.
- A cloud session may lack Playwright: `npm i playwright-core` in the scratchpad and point
  `PLAYWRIGHT` at its `index.mjs` (Chromium is at `/opt/pw-browsers`); Session 1 did this and
  smoke and the icon script ran. Say in Handover what did and didn't run.

---

## Session 1 — Planning and inventory (Fable, 2026-10-10)

**Goal:** the folder, the spec, this plan, the inventory tooling, the owner's open decisions
settled, and the CDX inventory run. **Status: done, bar the inventory**, which this cloud
environment couldn't run (archive.org is denied by its network policy; see Handover). The
inventory and the HTML sampling are Session 2's step 0, with the script ready.

- [x] `family-tree/` from `/sidequest` steps 1–2: the template, the icon (three nodes on a lilac
      fork) and its PNGs, `.gitignore` for `data/`, `mirror/`, `node_modules/`, `*.ged`.
- [x] `SPEC.md` from the brief, with the Decisions from the owner's interview.
- [x] `PLAN.md` (this), Sessions 2–4 specified.
- [x] `tools/cdx.mjs` + tests (parsing the CDX index, canonical URLs, the best capture per URL, the
      site's shape) and `tools/inventory.mjs` (the fetch, one request a second, resumable).
- [ ] ~~Run the inventory and sample the HTML~~ → Session 2 step 0 (network).
- [x] The owner's decisions (SPEC.md §8). The email to Jon drafted: `EMAIL-DRAFT.md`.
- [x] Handover. Pushed to `main`.

---

## Session 2 — Recovery (Opus 5.5)

**Goal:** a complete local mirror of familytree.inggs.com as the Wayback Machine holds it, with a
manifest that ties every file to its capture, a recovery report, and the site's HTML pattern
recorded here for the parser. No app work. Lands nothing on the live site except this doc.

**Owner, before the session** (each is a minute from the phone; the Session 1 Handover says how):

- [ ] The cloud environment allows `web.archive.org`, `archive.org` and `www.wikitree.com`.
- [ ] The private repo `kinggs/family-tree-data` exists (empty, private) and the environment can
      reach it (the session adds it with `add_repo` for push; if that's refused, the Handover
      says what to open).

**In the session, first:** `git clone https://github.com/kinggs/family-tree-data family-tree/data`
(gitignored here). If the clone can't happen, work in `family-tree/data/` anyway and say in
Handover that the mirror needs pushing from a machine that can.

### Step 0 — The inventory and the sample (Session 1's step 4)

- [ ] `node family-tree/tools/inventory.mjs`. It writes `data/cdx.json` (every capture),
      `data/cdx-best.json` (the chosen capture per URL) and `data/inventory.md`, and prints the
      shape. Paste the printed lines into **Findings** below. If the CDX returns nothing for
      `familytree.inggs.com/*`, try `inggs.com/*` and `*.inggs.com/*` by editing `HOST` for the
      run, and record what each returned.
- [ ] Is there a GEDCOM in the index (`describe()` says)? If so, it changes Session 3: say so in
      Findings, download it in step 1 like any file, and Session 3's parser becomes a GEDCOM
      reader first and an HTML parser for what the GEDCOM lacks (photos, notes).
- [ ] **Sample by hand** (BRIEF.md Phase 2 step 1): the home page, an index or surname page, and
      five or six person pages, fetched with the `id_` URL. Write **The site's pattern** below:
      the generator (a `<meta name="generator">`, a footer line, the file naming), where the
      name, sex, birth, death, parents, spouses and children sit (tags, classes, label text), how
      a person links to another (href shape, the id in it), how photos are referenced (`<img src>`
      shape, caption placement, a photo page or inline), the character set, and anything odd.
      Placeholders for names, never real ones.

### Step 1 — The mirror

- [ ] `tools/mirror.mjs`: reads `cdx-best.json`, downloads every URL with status 200 via
      `waybackRaw()` (the `id_` flag), one request a second with the same backoff as the
      inventory, into `data/mirror/<path as on the site>` (`familytree.inggs.com/people/p12.htm`
      → `data/mirror/people/p12.htm`; the root page → `index.html`; a query string becomes part of
      the file name, URL-encoded). **Never overwrites**: a file already there is skipped, so the
      run is resumable and the mirror immutable. Each file's row goes into `data/manifest.json`:
      `{ path, url, timestamp, status, mime, bytes, sha256, wayback (the view URL), raw (the id_
      URL), fetchedAt, kind }`. A URL with no 200 is listed in the manifest with its status and
      `path: null`, not fetched: that is the gaps log.
- [ ] A 200 that comes back as the Wayback Machine's own error page (an HTML body on an image
      URL, or a body with "Wayback Machine" and no site content) is logged as `status: "soft-404"`
      and not kept.
- [ ] `tools/mirror.test.mjs`: the path mapping, the skip-if-exists rule and the soft-404 test, on
      synthetic inputs.

### Step 2 — Strays

- [ ] `tools/strays.mjs`: parses every `.htm`/`.html` in the mirror for `href`, `src`, `background`
      and CSS `url()` references, resolves them against the page's URL, canonicalises
      (`cdx.canonical`), drops off-site links, and lists every on-site URL that isn't in
      `cdx-best.json`. For each, one exact CDX lookup (`url=<that url>&output=json`, same
      pacing); a hit is appended to `cdx.json` and `cdx-best.json`, then fetched by step 1's
      code. Repeat until a pass finds nothing new. A URL the CDX has never seen goes in the
      manifest as `status: "never-captured"`.
- [ ] `tools/strays.test.mjs`: link extraction and resolution on a synthetic page.

### Step 3 — The WikiTree cross-check (owner, 2026-10-10)

- [ ] Fetch `https://www.wikitree.com/genealogy/INGGS` (and the surname pages the recovered index
      names, if the owner allowed the host). Record in Findings: how many Inggs profiles WikiTree
      holds, whether Jon Inggs manages them, and roughly how the names and dates overlap with the
      recovered index (counts, not names). **Nothing is imported from it.** If the host isn't
      allowed, say so and move this to Parked.

### Step 4 — The recovery report

- [ ] `data/report.md`: URLs in the index, pages and images recovered, missing (by status), bytes,
      the capture date range, the GEDCOM question, the WikiTree counts, what strays found, and
      anything the parser should know. One page.
- [ ] Commit and push the data repo. Commit the tools and this doc's Findings and Handover to
      `main` (`/deployquest` is not needed: nothing on the live site changed; a plain push).

**Done when:** `data/mirror/` holds every 200 the index has, `manifest.json` has a row for every
URL in `cdx-best.json`, the report reads as one page, **The site's pattern** below is filled in,
and `git status` in `sidequests` shows no data.

### Findings (Session 2 fills in)

- Inventory: _the `describe()` lines_.
- GEDCOM in the index: _yes/no_.
- Recovered: _N pages, N images; missing N (401), N (404), N never captured_.
- WikiTree: _N profiles; managed by…; overlap…_.

### The site's pattern (Session 2 fills in; Session 3's parser and its fixtures follow it)

- Generator: _…_
- File naming and ids: _…_
- A person page: _where each field sits_.
- Links between people: _…_
- Photos and captions: _…_
- Index pages: _…_
- Character set and oddities: _…_

---

## Session 3 — Structure, the rules, and a gated shell with the people list (Opus 5.5)

**Goal:** `people.json`, `photos.json` and `inggs.ged` in the data repo, every record carrying its
source page; the seed files; the rules block; and the app live at
`https://kinggs.github.io/sidequests/family-tree/` as a sign-in-and-member gate with the People
tab working from Firestore. Lands `0.2.0`.

**Before starting:** clone the data repo as in Session 2. Read **The site's pattern** above. If
Session 2 found a GEDCOM, step 1 reads it first (see Session 2 step 0) and the HTML fills in
what it lacks.

### Step 1 — The parser

- [ ] `tools/parse.mjs` → `data/people.json` and `data/photos.json` in SPEC.md §4's shapes, read
      from `data/mirror/` only. HTML parsing with `cheerio` (`npm i --no-save cheerio` in
      `family-tree/tools/`, its `node_modules/` gitignored) unless the pages are regular enough
      for a small hand parser; either way `tools/parse.test.mjs` pins the pattern on **synthetic
      fixtures** written in that pattern (`tools/fixtures/`, invented names) and never on the
      mirror. Rules: never guess a date or a relationship; `date` verbatim, `year` only when four
      digits read cleanly; notes and captions verbatim; `refs` for a parent, spouse or child whose
      page couldn't be matched; `source` on every record (`url`, `wayback`, `captured` from the
      manifest).
- [ ] Validate: every `parents`, `spouses[].id`, `children` and `photos` id resolves; a photo's
      `recovered` is whether its file is in the mirror; a spouse link is symmetric and a
      parent/child link is mirrored (fix the data where one side is missing, and log it).
- [ ] `data/parse-report.md`: people parsed, photos (recovered vs missing), unresolved refs,
      pages that failed to parse, one-sided links fixed. The brief's one-page recovery report is
      this plus Session 2's.

### Step 2 — GEDCOM

- [ ] `tools/gedcom.mjs` (pure; `gedcom.test.mjs` on the same fixtures) → `data/inggs.ged`,
      GEDCOM 5.5.1, UTF-8: `HEAD` with `SOUR` "sidequests family-tree", a `SOUR` record naming
      **Jon Inggs** as compiler and familytree.inggs.com (2010) as the publication; one `INDI` per
      person (`NAME` given /surname/, `SEX`, `BIRT`/`DEAT` with `DATE` as written and `PLAC`,
      `NOTE`, `OBJE` per photo naming the mirror file, a `SOUR` citation with the Wayback URL);
      one `FAM` per couple or per single parent with children (`HUSB`, `WIFE`, `CHIL`, `MARR`
      with `DATE`/`PLAC`); `FAMC`/`FAMS` links; a `NOTE` on every unresolved ref. Every xref
      resolves (the test checks a round-trip of the ids).

### Step 3 — The seed, and a mock seed

- [ ] `tools/seed.mjs` → `data/seed/family-tree-1.json`, `-2.json`, …: the app's export format
      (SPEC.md §4), each file under 20 MB: the first carries `meta`, `people` and `photos`
      (thumbs ~400px, made with `sharp`? no: no native deps; use Chromium via `shared/proofs/pw.mjs`
      to draw and shrink, as `make-icons.mjs` does, or a pure-JS JPEG decoder/encoder in
      `node_modules` of `tools/` if Chromium can't be had), the rest carry `images` (1400px long
      edge JPEG data URLs) in chunks. `meta.photosRecovered` counts files actually in the mirror.
- [ ] `tools/mock-seed.mjs` → `shared/proofs/seeds/family-tree-mock.json`: about 15 invented
      people over four generations (two living by the rule, one with no birth year, one
      unresolved ref), six photos as small generated images (an SVG-drawn JPEG or a coloured
      PNG data URL), captions, one suggestion. Committed: it's invented. `?mock&seed=../shared/proofs/seeds/family-tree-mock.json`.

### Step 4 — The rules (cases first)

- [ ] Cases in `shared/rules-check.mjs`, a "Family Tree" describe block in the Sessions Loyalty
      style, seeded past the rules with members `owner` (role owner) and `ann`, newcomer `ben`
      connected to `ann` (`friendships/ann_ben`), stranger `cat`, a person, a photo, an image,
      meta, a suggestion:
  - a member reads people, photos, images, meta, suggestions, members and invites (get and list);
  - a newcomer gets `members/ben` (absent) and `invites/ben`; refused: listing either, any
    person, photo, image or meta;
  - signed out: refused everything;
  - ben creates `invites/ben` `{ uid: "ben", name, email: "ben@gmail.com", invitedBy: "ann",
    invitedByName, at, status: "pending" }`; refused: for cat (`uid` not his), `status: "approved"`,
    `invitedBy` someone he isn't connected to, another's email, an extra key;
  - ann creates `invites/cat` with `invitedBy: "ann"` when connected to cat; refused when not;
  - ann (the inviter) refused deciding `invites/ben`; the owner decides it (own invitees too); a
    second member `dee` decides it: the batch `{ status: "approved", decidedBy: "dee", decidedAt }`
    + `members/ben { name, since, invitedBy: "ann", approvedBy: "dee" }` succeeds; refused: the
    member doc alone, `approvedBy` not self, deciding an invite already decided, changing any
    other field, declining with a member doc in the batch;
  - a member refused writing people, photos, images, meta, members (bar approval), deleting an
    invite; the owner writes and deletes all of them;
  - a member creates a suggestion with `by` self; refused with `by` another or updating one; the
    owner updates and deletes;
  - a member creates `exports/x` with `by` self; refused reading the list; the owner reads it.
- [ ] The block in `shared/firestore.rules` after Sessions Loyalty's, `isFam()`, with
      `'family-tree'` added to the generic owner rule's exclusion list; the SPEC §4 table is the
      rule. The approval is `getAfter` on the invite in the same batch, as `confirming()` does.
- [ ] Guards in `shared/proofs/guards.mjs` for each new condition; rows in `shared/cloud-memory.js`
      (`isFam` there too). `KIT.md`'s open-rule row and CLAUDE.md's rules bullet name Family
      Tree beside Rack It and Sessions Loyalty.

### Step 5 — The shell

- [ ] Replace the placeholder section of `index.html` with: the gate (signed out), the
      **waiting screen** (a newcomer, watching `invites/<me>` and `members/<me>`), and the three
      tabs with People working: the credit line, search, the surname-grouped list (SPEC §2). A
      person's tap opens a stub person page: name, years, source link, "More in the next
      session". Photos and Family tabs say "Coming next". The account sheet: Profile, My QR,
      Friends, Export (logged), Import (the owner; the seed files; batches of 400, images 10),
      Install, Sign out. `connect.handleInvite({ app, appName, onDone })` writes the newcomer's
      invite from `onDone({ uid })` when there is no `members/<me>` and no invite yet
      (SPEC §5 step 2). The invite UI itself (approve, decline, invite a friend) is Session 4;
      but the waiting screen and the invite write are here, so the rules are exercised end to end.
- [ ] Living rule applied in the stub page already (`isLiving()` in a small pure function in the
      page; the years line shows nothing for a living person without Show details).
- [ ] `shared/proofs/family-tree-gate.mjs`: the owner on the mock seed sees the people list and
      imports a second seed file without duplicates; `&as=stranger` sees the waiting screen and
      nothing else; signed out sees Sign in; a two-tab scan (`h.mjs`, as `connect-scan.mjs` does)
      writes `invites/<newcomer>` with the right `invitedBy`. Smoke green.
- [ ] Version `0.2.0`, `CACHE` to match, `/deployquest`; wait for the rules Action and report it.
- [ ] Commit and push the data repo (people.json, photos.json, inggs.ged, seed/).
- [ ] **Owner:** sign in to the live URL (the phone, or a laptop browser for the big files),
      account sheet → Import each `seed/family-tree-N.json` in order; the People tab fills.
      Tick this box.

**Done when:** `node --test` passes with the parser and GEDCOM tests; the rules Action is green on
the new cases; the owner sees the real people list on the phone; a stranger sees the waiting
screen; nothing personal is in `sidequests`.

---

## Session 4 — The interface, invites, and the MVP (Opus 5.5)

**Goal:** the person page, the tree view, the photo gallery, suggestions, the Family tab with
invites and members, the launcher tile, and `1.0.0` live. MVP done when Kenny can sign in on his
phone and browse to his grandparents' photos, and his father can be invited by QR and approved.

Read `shared/DESIGN.md` again before this session; the tree view and the photo treatment are the
app's own CSS, everything else is theme parts. If a `frontend-design` skill is available in the
session, load it before the tree view; if not, say so and build from DESIGN.md.

- [ ] **The person page** (SPEC §2): photos strip, Born/Died, Parents/Married/Children rows with
      `(not in the tree)` for a `ref`, Notes verbatim, Source with the Wayback link, **Tree**
      (76px), **Suggest a correction** (a sheet → `suggestions/`). Living: Show details toggles
      the dates and places, per phone.
- [ ] **The tree view**: three generations up and down and spouses beside, the centre in lilac,
      the descendant side's lines in coral; cards of name and years; a tap re-centres; scrolls both
      ways; readable at 390×844 with nothing under 15px; no animation under reduced motion. Build
      it as one `<section class="tree">` with CSS grid rows per generation and SVG lines drawn
      from the laid-out card positions (a `ResizeObserver` redraws). Test with the mock seed's four
      generations and with a person who has no parents and no children.
- [ ] **Photos** tab: the grid of thumbs with captions, a placeholder for a photo not recovered;
      the photo page loads `images/<id>` on demand, shows the caption, the people as chips, the
      source.
- [ ] **Family** tab: members with "invited by · approved by"; **Waiting** with Approve and
      Decline in each row's `⋯` (one batch, SPEC §5); **Show my QR** (`connect.showQR({ app })`);
      **Invite a friend** (`people.pick`-style sheet over `cloud.account.watchFriends`, minus
      members and invitees) → `invites/<uid>`; the owner's **Hold to remove** on a member. The
      newcomer's phone opens the app the moment its invite is approved.
- [ ] **Suggestions for the owner**: a section on the Family tab the owner alone sees, each
      suggestion with the person, the text, who and when, and **Done** (hold) → `status: "done"`.
- [ ] The launcher tile in the root `index.html`, alphabetical (between Bloc 11 and Photo Coach),
      lilac, "The family tree, from Jon's research".
- [ ] `shared/proofs/family-tree-invites.mjs`: two tabs: the owner shows My QR, `dad` lands with
      `&i=<code>`, sees the waiting screen, the owner approves from the Family tab, dad's tab opens
      the people list; a second member `ann` invites friend `eve` without a QR; the owner declines
      `eve`; `ann` can't approve her own invitee but `dad` can. `family-tree-tree.mjs`: the tree
      view renders four generations at 390×844 with no overlap (card rects don't intersect) and a
      screenshot to `SHOTS`. Smoke green.
- [ ] SPEC.md updated to "the app as it is"; KIT.md's row; this doc's Handover.
- [ ] Version `1.0.0`, `/deployquest`.
- [ ] **Owner:** install on the phone, browse to the grandparents' photos, show Dad the QR, approve
      him. Tick this box. Send the email to Jon if not yet sent (`EMAIL-DRAFT.md`).

**Done when:** the owner's step above is ticked.

---

## Parked (not in any session)

- Members editing people directly, with an edit history (`history/` per person); then adding
  photos (the photo-coach pattern, 1400px data URLs; Firebase Storage if that gets heavy).
- A member claiming the person in the tree that is them (links a `people/<id>` to a uid; would let
  "Show details" default to on for your own record).
- Jon as a member with edit rights, if he wants in.
- Importing anything from WikiTree, if the cross-check finds Jon's tree there and the owner says so.
- An ancestor or descendant *chart* for print (a PDF of the tree).
- A "This day" or "Born 100 years ago" note on the People tab.
- A one-off Node seed using the Admin SDK, if the owner ever adds a service account with Firestore
  write; until then the app's Import is the seed (no server code, no paid plan: KIT-PLAN.md).
- Revisit the trust-the-family approval if membership passes a few dozen.
- The 24-hour QR code can't be printed for a family gathering (KIT-PLAN Parked, Groups).

## Handover

Each session appends a short note: what shipped, what was skipped and why, what the next session
must know.

### After Session 1 (Fable, 2026-10-10)

**Done:** the folder (`0.1.0`, a `_template` placeholder with lilac/coral accents, the credit in
the footer, the icon and its PNGs), `SPEC.md`, this plan, `tools/cdx.mjs` + 8 tests,
`tools/inventory.mjs`, `EMAIL-DRAFT.md`, the owner's seven decisions (SPEC §8), CLAUDE.md's
layout line and DESIGN.md's ramp row. `node --test`: 50 pass. Smoke on `family-tree` green
(owner, stranger, signed out) with Playwright from the scratchpad. Nothing is on the launcher yet.

**Not done: the inventory and the sample.** This cloud environment's network policy denies every
archive.org host (`web.archive.org`, `archive.org`, `wayback.archive.org`: the proxy answers 403
to CONNECT), and `WebFetch` is denied the same way; `www.genealogy.com`, `www.wikitree.com` and
`linkpendium.com` fail too. So Session 1 step 4 (the counts, the URL conventions, the generator,
whether a GEDCOM was published) is Session 2's step 0, with the script written and tested on
synthetic rows. What the web search did show, from snippets only: the only inbound link to
familytree.inggs.com is a Genealogy.com South Africa board post signed **Jon Inggs** (Mildenhall
and Hinton ancestors; his address written with backslashes, `http:\familytree.inggs.com`), and
WikiTree's INGGS surname page lists profiles managed by Jon Inggs. Both are leads, not facts
about the site.

**Owner, before Session 2** (three things, each a minute):

1. **Allow the hosts.** In the Claude Code app: the cloud environment menu in the session's title
   bar → Edit → Network access → Allowed domains: add `web.archive.org`, `archive.org` and
   `www.wikitree.com` (keep "Allow package managers" ticked). Steps:
   https://code.claude.com/docs/en/cloud-environments#network-access. The change applies to new
   sessions.
2. **Make the data repo.** GitHub → New repository → `family-tree-data`, **Private**, with a
   README. Nothing else. The session asks for push access to it when it starts (`add_repo`); if
   GitHub refuses, the error names the settings page to open.
3. **Send the email** (`EMAIL-DRAFT.md`), or wait for the recovered site to confirm the name.
   The build doesn't wait on a reply.

**Choices made where the brief was open** (all in SPEC §8 or §2):

- The app is three tabs with the tree view reached from a person, not a single scrolling Home:
  five screens is past DESIGN.md's four.
- The seed is the app's own Import of files under 20 MB, since there's no server code and the
  only service account the repo has can deploy rules, not write Firestore.
- "Born after 1926" became "born within the last 100 years, or no birth year", so it doesn't
  rot; Show details is per phone.
- Invites are keyed by the newcomer's uid (one invite per account), and the newcomer writes their
  own, with the friendship as proof that the QR was a member's. An invited friend's invite is
  written by the member instead. The rules cases in Session 3 spell out both.
- The tools' tests run under the repo's `node --test`, so they must stay synthetic.
- `cdx.mjs` treats a Wayback *revisit* row as carrying the status of the capture with the same
  digest, and keeps a URL that never returned 200 in the chosen list (as a gap) rather than
  dropping it.
- Coral is the second accent for the descendant side of the tree; if it reads as a warning next
  to amber (Rack It's experience), Session 4 may drop `--accent-2` and draw both sides neutral.
  Say so here if it does.

**Environment notes for Opus.** Node 22, Ruby 3.3 (the brief's `wayback-machine-downloader`
would run, but the tools are ours), Java absent (no rules emulator: the Action is the check),
Chromium at `/opt/pw-browsers`, Playwright by `npm i playwright-core` in the scratchpad then
`PLAYWRIGHT=<scratchpad>/node_modules/playwright-core/index.mjs`. `registry.npmjs.org` and
`raw.githubusercontent.com` are reachable; `*.github.io` isn't (the deploy skill's fallback proof
applies). `gh` is installed and proxy-configured. Pushes go over HTTPS.
